import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  AppError,
  buildGetAutomationsRequest,
  buildUpdateQueryTextRequest,
  DataExtensionService,
  ErrorCode,
  MCE_TIMEOUTS,
  MceBridgeService,
  MetadataService,
  QueryDefinitionService,
  RlsContextService,
} from '@qpp/backend-shared';
import type {
  BlastRadiusResponse,
  CreateQueryActivityDto,
  DriftCheckResponse,
  LinkQueryResponse,
  PublishQueryResponse,
  QADetail,
  QAListItem,
} from '@qpp/shared-types';

import { SavedQueriesService } from '../saved-queries/saved-queries.service';
import type { QueryPublishEventsRepository } from './query-publish-events.repository';

const AUTOMATION_STATUS_MAP: Record<number, string> = {
  [-1]: 'Error',
  0: 'BuildError',
  1: 'Building',
  2: 'Ready',
  3: 'Running',
  4: 'Paused',
  5: 'Stopped',
  6: 'Scheduled',
  7: 'Awaiting Trigger',
  8: 'InactiveTrigger',
};

const HIGH_RISK_STATUSES = new Set([3, 6, 7]);

const MAX_AUTOMATION_PAGES = 10;
const AUTOMATIONS_PAGE_SIZE = 200;
const QUERY_ACTIVITY_OBJECT_TYPE_ID = 300;
const QPP_SHELL_QUERY_PREFIX = 'QPP_Query_';

interface AutomationActivity {
  id: string;
  name: string;
  objectTypeId: number;
  activityObjectId: string;
}

interface AutomationStep {
  stepNumber: number;
  activities: AutomationActivity[];
}

interface AutomationItem {
  id: string;
  name: string;
  description?: string;
  statusId: number;
  steps: AutomationStep[];
}

interface AutomationListResponse {
  items: AutomationItem[];
  page: number;
  pageSize: number;
  count: number;
}

@Injectable()
export class QueryActivitiesService {
  constructor(
    private readonly dataExtensionService: DataExtensionService,
    private readonly queryDefinitionService: QueryDefinitionService,
    private readonly metadataService: MetadataService,
    private readonly savedQueriesService: SavedQueriesService,
    private readonly mceBridgeService: MceBridgeService,
    private readonly rlsContext: RlsContextService,
    @Inject('QUERY_PUBLISH_EVENT_REPOSITORY')
    private readonly publishEventRepo: QueryPublishEventsRepository,
  ) {}

  async listAllWithLinkStatus(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<QAListItem[]> {
    const [allQaList, linkedMap] = await Promise.all([
      this.queryDefinitionService.retrieveAll(tenantId, userId, mid),
      this.savedQueriesService.findAllLinkedQaKeys(tenantId, mid, userId),
    ]);

    const qaList = allQaList.filter(
      (qa) => !qa.customerKey.startsWith(QPP_SHELL_QUERY_PREFIX),
    );

    return qaList.map((qa) => ({
      objectId: qa.objectId,
      customerKey: qa.customerKey,
      name: qa.name,
      categoryId: qa.categoryId,
      targetUpdateType: qa.targetUpdateType,
      modifiedDate: qa.modifiedDate,
      status: qa.status,
      targetDEName: qa.targetDEName,
      isLinked: linkedMap.has(qa.customerKey),
      linkedToQueryName: linkedMap.get(qa.customerKey) ?? null,
    }));
  }

  async getDetail(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<QADetail> {
    const detail = await this.queryDefinitionService.retrieveDetail(
      tenantId,
      userId,
      mid,
      customerKey,
    );

    if (!detail) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'getQueryActivityDetail',
        reason: `Query Activity not found: ${customerKey}`,
      });
    }

    const linkedMap = await this.savedQueriesService.findAllLinkedQaKeys(
      tenantId,
      mid,
      userId,
    );

    return {
      objectId: detail.objectId,
      customerKey: detail.customerKey,
      name: detail.name,
      categoryId: detail.categoryId,
      queryText: detail.queryText,
      targetUpdateType: detail.targetUpdateType,
      targetDEName: detail.targetDEName,
      targetDECustomerKey: detail.targetDECustomerKey,
      modifiedDate: detail.modifiedDate,
      status: detail.status,
      isLinked: linkedMap.has(detail.customerKey),
      linkedToQueryName: linkedMap.get(detail.customerKey) ?? null,
    };
  }

  async linkQuery(
    tenantId: string,
    userId: string,
    mid: string,
    savedQueryId: string,
    qaCustomerKey: string,
    conflictResolution?: 'keep-local' | 'keep-remote',
  ): Promise<LinkQueryResponse> {
    const qaDetail = await this.queryDefinitionService.retrieveDetail(
      tenantId,
      userId,
      mid,
      qaCustomerKey,
    );

    if (!qaDetail) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'linkQuery',
        reason: `Query Activity not found: ${qaCustomerKey}`,
      });
    }

    const linkParams = {
      linkedQaObjectId: qaDetail.objectId,
      linkedQaCustomerKey: qaDetail.customerKey,
      linkedQaName: qaDetail.name,
    };

    let sqlUpdated = false;

    if (conflictResolution === 'keep-remote' && qaDetail.queryText) {
      await this.savedQueriesService.updateSqlAndLink(
        tenantId,
        mid,
        userId,
        savedQueryId,
        qaDetail.queryText,
        linkParams,
      );
      sqlUpdated = true;
    } else {
      await this.savedQueriesService.linkToQA(
        tenantId,
        mid,
        userId,
        savedQueryId,
        linkParams,
      );
    }

    return {
      linkedQaObjectId: qaDetail.objectId,
      linkedQaCustomerKey: qaDetail.customerKey,
      linkedQaName: qaDetail.name,
      linkedAt: new Date().toISOString(),
      sqlUpdated,
    };
  }

  async unlinkQuery(
    tenantId: string,
    userId: string,
    mid: string,
    savedQueryId: string,
  ): Promise<{ success: true }> {
    await this.savedQueriesService.unlinkFromQA(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );
    return { success: true };
  }

  async create(
    tenantId: string,
    userId: string,
    mid: string,
    dto: CreateQueryActivityDto,
  ): Promise<{ objectId: string; customerKey: string }> {
    const targetDE = await this.dataExtensionService.retrieveByCustomerKey(
      tenantId,
      userId,
      mid,
      dto.targetDataExtensionCustomerKey,
      dto.targetDataExtensionEid,
    );

    if (!targetDE) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'createQueryActivity',
        reason: 'Target Data Extension not found',
        field: 'targetDataExtensionCustomerKey',
      });
    }

    if (dto.targetUpdateType === 'Update') {
      const fields = await this.metadataService.getFields(
        tenantId,
        userId,
        mid,
        dto.targetDataExtensionCustomerKey,
        dto.targetDataExtensionEid,
      );
      const hasPrimaryKey = (
        fields as { IsPrimaryKey?: boolean | string }[]
      ).some((f) => f.IsPrimaryKey === true || f.IsPrimaryKey === 'true');

      if (!hasPrimaryKey) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
          operation: 'createQueryActivity',
          reason:
            'Update mode requires the target Data Extension to have a Primary Key.',
          field: 'targetUpdateType',
        });
      }
    }

    const existingByName =
      await this.queryDefinitionService.retrieveByNameAndFolder(
        tenantId,
        userId,
        mid,
        dto.name,
        dto.categoryId,
      );

    if (existingByName) {
      throw new AppError(ErrorCode.DUPLICATE_QUERY_ACTIVITY_NAME, undefined, {
        operation: 'createQueryActivity',
        reason: `Query Activity named "${dto.name}" already exists in this folder`,
        field: 'name',
      });
    }

    const customerKey =
      dto.customerKey?.trim() || crypto.randomUUID().toUpperCase();

    if (dto.customerKey?.trim()) {
      const existingByKey = await this.queryDefinitionService.retrieve(
        tenantId,
        userId,
        mid,
        customerKey,
      );

      if (existingByKey) {
        throw new AppError(ErrorCode.DUPLICATE_CUSTOMER_KEY, undefined, {
          operation: 'createQueryActivity',
          reason: `Query Activity with customerKey "${customerKey}" already exists`,
          field: 'customerKey',
        });
      }
    }

    const result = await this.queryDefinitionService.create(
      tenantId,
      userId,
      mid,
      {
        name: dto.name,
        customerKey,
        categoryId: dto.categoryId,
        targetId: targetDE.objectId,
        targetCustomerKey: targetDE.customerKey,
        targetName: targetDE.name,
        queryText: dto.queryText,
        description: dto.description,
        targetUpdateType: dto.targetUpdateType,
      },
    );

    return { objectId: result.objectId, customerKey };
  }

  async publish(
    tenantId: string,
    userId: string,
    mid: string,
    savedQueryId: string,
    versionId: string,
  ): Promise<PublishQueryResponse> {
    const savedQuery = await this.savedQueriesService.findById(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );

    if (!savedQuery.linkedQaObjectId || !savedQuery.linkedQaCustomerKey) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'publishQuery',
        reason: 'Saved query is not linked to a Query Activity',
      });
    }

    const { linkedQaObjectId, linkedQaCustomerKey } = savedQuery;

    const versionSql = await this.savedQueriesService.getVersionSql(
      tenantId,
      mid,
      userId,
      savedQueryId,
      versionId,
    );

    if (!versionSql) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'publishQuery',
        reason: `Version not found: ${versionId}`,
      });
    }

    const request = buildUpdateQueryTextRequest(
      linkedQaObjectId,
      versionSql.sqlText,
    );
    await this.mceBridgeService.request(
      tenantId,
      userId,
      mid,
      request,
      MCE_TIMEOUTS.METADATA,
    );

    const publishedSqlHash = this.hashSqlText(versionSql.sqlText);

    const event = await this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      () =>
        this.publishEventRepo.create({
          savedQueryId,
          versionId,
          tenantId,
          mid,
          userId,
          linkedQaCustomerKey,
          publishedSqlHash,
        }),
    );

    return {
      publishEventId: event.id,
      versionId: event.versionId,
      savedQueryId: event.savedQueryId,
      publishedSqlHash: event.publishedSqlHash,
      publishedAt: event.createdAt.toISOString(),
    };
  }

  async checkDrift(
    tenantId: string,
    userId: string,
    mid: string,
    savedQueryId: string,
  ): Promise<DriftCheckResponse> {
    const savedQuery = await this.savedQueriesService.findById(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );

    if (!savedQuery.linkedQaCustomerKey) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'checkDrift',
        reason: 'Saved query is not linked to a Query Activity',
      });
    }

    const localVersion = await this.savedQueriesService.getLatestVersionSql(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );

    const localSql = localVersion?.sqlText ?? '';

    const remoteDetail = await this.queryDefinitionService.retrieveDetail(
      tenantId,
      userId,
      mid,
      savedQuery.linkedQaCustomerKey,
    );

    const remoteSql = remoteDetail?.queryText ?? '';

    const localHash = this.hashSqlText(localSql);
    const remoteHash = this.hashSqlText(remoteSql);

    return {
      hasDrift: localHash !== remoteHash,
      localSql,
      remoteSql,
      localHash,
      remoteHash,
    };
  }

  async getBlastRadius(
    tenantId: string,
    userId: string,
    mid: string,
    savedQueryId: string,
  ): Promise<BlastRadiusResponse> {
    const savedQuery = await this.savedQueriesService.findById(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );

    if (!savedQuery.linkedQaObjectId) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'getBlastRadius',
        reason: 'Saved query is not linked to a Query Activity',
      });
    }

    const targetObjectId = savedQuery.linkedQaObjectId;
    const automations: BlastRadiusResponse['automations'] = [];
    let page = 1;
    let totalCount = 0;

    while (page <= MAX_AUTOMATION_PAGES) {
      const request = buildGetAutomationsRequest(page, AUTOMATIONS_PAGE_SIZE);
      const response =
        await this.mceBridgeService.request<AutomationListResponse>(
          tenantId,
          userId,
          mid,
          request,
          MCE_TIMEOUTS.METADATA,
        );

      if (response.items) {
        for (const automation of response.items) {
          const containsQa = this.automationContainsQa(
            automation,
            targetObjectId,
          );
          if (containsQa) {
            const statusId = automation.statusId ?? 0;
            automations.push({
              id: automation.id,
              name: automation.name,
              description: automation.description,
              status: AUTOMATION_STATUS_MAP[statusId] ?? 'Unknown',
              isHighRisk: HIGH_RISK_STATUSES.has(statusId),
            });
          }
        }
      }

      totalCount = response.count ?? 0;
      const fetched = page * AUTOMATIONS_PAGE_SIZE;
      if (fetched >= totalCount) {
        break;
      }
      page++;
    }

    return { automations, totalCount: automations.length };
  }

  private automationContainsQa(
    automation: AutomationItem,
    qaObjectId: string,
  ): boolean {
    if (!automation.steps) {
      return false;
    }
    for (const step of automation.steps) {
      if (!step.activities) {
        continue;
      }
      for (const activity of step.activities) {
        if (
          activity.objectTypeId === QUERY_ACTIVITY_OBJECT_TYPE_ID &&
          activity.activityObjectId === qaObjectId
        ) {
          return true;
        }
      }
    }
    return false;
  }

  private hashSqlText(sqlText: string): string {
    return crypto.createHash('sha256').update(sqlText).digest('hex');
  }
}
