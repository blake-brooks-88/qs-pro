import * as crypto from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  buildGetAutomationDetailRequest,
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
const AUTOMATION_DETAIL_CONCURRENCY = 5;
const QUERY_ACTIVITY_OBJECT_TYPE_ID = 300;
const QPP_SHELL_QUERY_PREFIX = 'QPP_Query_';
const BLAST_RADIUS_DIAGNOSTICS_ENV = 'QPP_BLAST_RADIUS_DIAGNOSTICS';
const BLAST_RADIUS_DIAGNOSTICS_MAX_CHARS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function truncateForLogs(value: string, maxChars: number): string {
  return value.length <= maxChars
    ? value
    : `${value.slice(0, maxChars)}... [truncated]`;
}

function safeJsonForLogs(value: unknown, maxChars: number): string {
  try {
    return truncateForLogs(JSON.stringify(value), maxChars);
  } catch {
    return '[unserializable]';
  }
}

interface AutomationListItem {
  id: string;
  name: string;
  description?: string;
  status: number;
}

@Injectable()
export class QueryActivitiesService {
  private readonly logger = new Logger(QueryActivitiesService.name);

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
    options: { deleteLocal: boolean; deleteRemote: boolean } = {
      deleteLocal: false,
      deleteRemote: false,
    },
  ): Promise<{ success: true }> {
    const savedQuery = await this.savedQueriesService.findById(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );

    const { linkedQaObjectId } = savedQuery;

    if (options.deleteRemote && !linkedQaObjectId) {
      throw new AppError(ErrorCode.INVALID_STATE, undefined, {
        operation: 'unlinkQuery',
        reason:
          'Cannot delete remote Query Activity: saved query has no linked ObjectID',
      });
    }

    await this.savedQueriesService.unlinkFromQA(
      tenantId,
      mid,
      userId,
      savedQueryId,
    );

    if (options.deleteRemote && linkedQaObjectId) {
      await this.queryDefinitionService.delete(
        tenantId,
        userId,
        mid,
        linkedQaObjectId,
      );
    }

    if (options.deleteLocal) {
      await this.savedQueriesService.delete(
        tenantId,
        mid,
        userId,
        savedQueryId,
      );
    }

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
    const diagnosticsEnabled =
      process.env[BLAST_RADIUS_DIAGNOSTICS_ENV] === '1';

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
    const normalizedTargetObjectId = targetObjectId.trim().toLowerCase();
    const targetCustomerKey = savedQuery.linkedQaCustomerKey;
    const normalizedTargetCustomerKey =
      typeof targetCustomerKey === 'string' && targetCustomerKey.trim() !== ''
        ? targetCustomerKey.trim().toLowerCase()
        : null;

    if (diagnosticsEnabled) {
      this.logger.warn(
        `[blast-radius] diagnostics enabled (${BLAST_RADIUS_DIAGNOSTICS_ENV}=1) tenantId=${tenantId} mid=${mid} savedQueryId=${savedQueryId} targetObjectId=${targetObjectId} targetCustomerKey=${targetCustomerKey ?? '[null]'}`,
      );
    }

    const allListItems: AutomationListItem[] = [];
    const seenAutomationIds = new Set<string>();
    let page = 1;

    while (page <= MAX_AUTOMATION_PAGES) {
      const listRequest = buildGetAutomationsRequest(
        page,
        AUTOMATIONS_PAGE_SIZE,
      );
      const rawResponse = await this.mceBridgeService.request<unknown>(
        tenantId,
        userId,
        mid,
        listRequest,
        MCE_TIMEOUTS.METADATA,
      );

      const responseRecord = isRecord(rawResponse) ? rawResponse : null;
      const entry =
        responseRecord && Array.isArray(responseRecord.entry)
          ? responseRecord.entry
          : null;
      const items =
        responseRecord && Array.isArray(responseRecord.items)
          ? responseRecord.items
          : null;

      const rawListItems = entry ?? items ?? [];
      const parsedListItems: AutomationListItem[] = [];
      for (const rawItem of rawListItems) {
        if (!isRecord(rawItem)) {
          continue;
        }
        const idValue = rawItem.id ?? rawItem.ID;
        const nameValue = rawItem.name ?? rawItem.Name;
        const descriptionValue = rawItem.description ?? rawItem.Description;
        const statusValue =
          rawItem.statusId ?? rawItem.StatusId ?? rawItem.status;

        if (typeof idValue !== 'string' || typeof nameValue !== 'string') {
          continue;
        }

        const statusNumber =
          typeof statusValue === 'number'
            ? statusValue
            : typeof statusValue === 'string' && statusValue.trim() !== ''
              ? Number(statusValue)
              : 0;

        parsedListItems.push({
          id: idValue,
          name: nameValue,
          description:
            typeof descriptionValue === 'string' ? descriptionValue : undefined,
          status: Number.isFinite(statusNumber) ? statusNumber : 0,
        });
      }

      let newIds = 0;
      for (const item of parsedListItems) {
        if (seenAutomationIds.has(item.id)) {
          continue;
        }
        seenAutomationIds.add(item.id);
        allListItems.push(item);
        newIds++;
      }

      const totalResultsValue = responseRecord?.totalResults;
      const totalResults =
        typeof totalResultsValue === 'number'
          ? totalResultsValue
          : typeof totalResultsValue === 'string' &&
              totalResultsValue.trim() !== ''
            ? Number(totalResultsValue)
            : null;

      const reportedCountValue = responseRecord?.count;
      const reportedCount =
        typeof reportedCountValue === 'number'
          ? reportedCountValue
          : typeof reportedCountValue === 'string' &&
              reportedCountValue.trim() !== ''
            ? Number(reportedCountValue)
            : null;

      const totalCount =
        typeof totalResults === 'number' && Number.isFinite(totalResults)
          ? totalResults
          : typeof reportedCount === 'number' && Number.isFinite(reportedCount)
            ? reportedCount
            : null;

      if (diagnosticsEnabled && page === 1) {
        this.logger.warn(
          `[blast-radius] list page=1 url=${listRequest.url} keys=${responseRecord ? Object.keys(responseRecord).join(',') : '[non-object]'} itemsField=${entry ? 'entry' : items ? 'items' : '[none]'} itemsReturned=${parsedListItems.length} itemsNew=${newIds} totalResults=${totalResults ?? '[unknown]'} count=${reportedCount ?? '[unknown]'} totalCount=${totalCount ?? '[unknown]'} raw=${safeJsonForLogs(rawResponse, BLAST_RADIUS_DIAGNOSTICS_MAX_CHARS)}`,
        );
      }

      if (parsedListItems.length === 0) {
        break;
      }
      if (newIds === 0) {
        if (diagnosticsEnabled) {
          this.logger.warn(
            `[blast-radius] pagination stopped early (no new ids). url=${listRequest.url}`,
          );
        }
        break;
      }
      if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
        if (allListItems.length >= totalCount) {
          break;
        }
      } else if (parsedListItems.length < AUTOMATIONS_PAGE_SIZE) {
        break;
      }
      page++;
    }

    const automations: BlastRadiusResponse['automations'] = [];
    let detailRequests = 0;
    let detailFailures = 0;

    for (
      let i = 0;
      i < allListItems.length;
      i += AUTOMATION_DETAIL_CONCURRENCY
    ) {
      const batch = allListItems.slice(i, i + AUTOMATION_DETAIL_CONCURRENCY);
      const details = await Promise.allSettled(
        batch.map(async (item) => {
          const detailRequest = buildGetAutomationDetailRequest(item.id);
          const rawDetail = await this.mceBridgeService.request<unknown>(
            tenantId,
            userId,
            mid,
            detailRequest,
            MCE_TIMEOUTS.METADATA,
          );

          if (diagnosticsEnabled) {
            const detailRecord = isRecord(rawDetail) ? rawDetail : null;
            const steps = detailRecord?.steps;
            const stepsCount = Array.isArray(steps) ? steps.length : 0;
            this.logger.warn(
              `[blast-radius] detail url=${detailRequest.url} keys=${detailRecord ? Object.keys(detailRecord).join(',') : '[non-object]'} stepsCount=${stepsCount} raw=${safeJsonForLogs(rawDetail, BLAST_RADIUS_DIAGNOSTICS_MAX_CHARS)}`,
            );
          }

          return rawDetail;
        }),
      );
      detailRequests += details.length;
      detailFailures += details.filter((r) => r.status === 'rejected').length;

      for (let j = 0; j < details.length; j++) {
        const listItem = batch[j];
        const detailResult = details[j];
        if (!listItem || !detailResult) {
          continue;
        }

        if (detailResult.status === 'rejected') {
          if (diagnosticsEnabled) {
            this.logger.warn(
              `[blast-radius] detail request failed automationId=${listItem.id} error=${safeJsonForLogs(detailResult.reason, BLAST_RADIUS_DIAGNOSTICS_MAX_CHARS)}`,
            );
          }
          continue;
        }

        const detail = detailResult.value;
        if (
          this.automationContainsQa(
            detail,
            {
              objectId: normalizedTargetObjectId,
              customerKey: normalizedTargetCustomerKey,
            },
            {
              diagnosticsEnabled,
              automationId: listItem.id,
              automationName: listItem.name,
              rawAutomation: detail,
            },
          )
        ) {
          const status = listItem.status ?? 0;
          automations.push({
            id: listItem.id,
            name: listItem.name,
            description: listItem.description,
            status: AUTOMATION_STATUS_MAP[status] ?? 'Unknown',
            isHighRisk: HIGH_RISK_STATUSES.has(status),
          });
        }
      }
    }

    if (detailFailures > 0) {
      // Monitoring: This indicates incomplete safety analysis. If this becomes
      // common, consider retries/backoff or failing the endpoint.
      this.logger.warn(
        `[blast-radius] partial result detailFailures=${detailFailures} detailRequests=${detailRequests}`,
      );
    }

    return {
      automations,
      totalCount: automations.length,
      ...(detailFailures > 0
        ? {
            partial: true,
            detailRequests,
            detailFailures,
          }
        : {}),
    };
  }

  private automationContainsQa(
    automation: unknown,
    qa: { objectId: string; customerKey: string | null },
    opts?: {
      diagnosticsEnabled: boolean;
      automationId: string;
      automationName: string;
      rawAutomation: unknown;
    },
  ): boolean {
    if (!isRecord(automation)) {
      if (opts?.diagnosticsEnabled) {
        this.logger.warn(
          `[blast-radius] automationContainsQa: non-object automationId=${opts.automationId} name=${opts.automationName} raw=${safeJsonForLogs(opts.rawAutomation, BLAST_RADIUS_DIAGNOSTICS_MAX_CHARS)}`,
        );
      }
      return false;
    }

    const stepsValue = automation.steps;
    const steps = Array.isArray(stepsValue) ? stepsValue : null;
    if (!steps) {
      if (opts?.diagnosticsEnabled) {
        this.logger.warn(
          `[blast-radius] automationContainsQa: missing steps automationId=${opts.automationId} name=${opts.automationName} keys=${Object.keys(automation).join(',')}`,
        );
      }
      return false;
    }

    let comparisonsLogged = 0;
    for (const step of steps) {
      if (!isRecord(step)) {
        continue;
      }
      const activitiesValue = step.activities ?? step.Activities;
      const activities = Array.isArray(activitiesValue)
        ? activitiesValue
        : null;
      if (!activities) {
        continue;
      }

      for (const activity of activities) {
        if (!isRecord(activity)) {
          continue;
        }

        const rawObjectTypeId =
          activity.objectTypeId ??
          activity.objectTypeID ??
          activity.ObjectTypeId;
        const objectTypeId =
          typeof rawObjectTypeId === 'number'
            ? rawObjectTypeId
            : typeof rawObjectTypeId === 'string' &&
                rawObjectTypeId.trim() !== ''
              ? Number(rawObjectTypeId)
              : null;

        const rawActivityObjectId =
          activity.activityObjectId ??
          activity.activityObjectID ??
          activity.ActivityObjectId ??
          activity.objectId ??
          activity.ObjectId;
        const activityObjectId =
          typeof rawActivityObjectId === 'string'
            ? rawActivityObjectId.trim().toLowerCase()
            : typeof rawActivityObjectId === 'number'
              ? String(rawActivityObjectId)
              : null;

        if (opts?.diagnosticsEnabled && comparisonsLogged < 50) {
          comparisonsLogged++;
          this.logger.warn(
            `[blast-radius] compare automationId=${opts.automationId} name=${opts.automationName} targetObjectId=${qa.objectId} targetCustomerKey=${qa.customerKey ?? '[null]'} objectTypeId=${objectTypeId ?? '[null]'} activityObjectId=${activityObjectId ?? '[null]'} rawKeys=${Object.keys(activity).join(',')}`,
          );
        }

        if (
          opts?.diagnosticsEnabled &&
          activityObjectId === qa.objectId &&
          objectTypeId !== QUERY_ACTIVITY_OBJECT_TYPE_ID
        ) {
          this.logger.warn(
            `[blast-radius] objectId match but objectTypeId mismatch automationId=${opts.automationId} name=${opts.automationName} expectedObjectTypeId=${QUERY_ACTIVITY_OBJECT_TYPE_ID} actualObjectTypeId=${objectTypeId ?? '[null]'}`,
          );
        }

        if (
          objectTypeId === QUERY_ACTIVITY_OBJECT_TYPE_ID &&
          (activityObjectId === qa.objectId ||
            (qa.customerKey !== null && activityObjectId === qa.customerKey))
        ) {
          if (opts?.diagnosticsEnabled) {
            this.logger.warn(
              `[blast-radius] MATCH automationId=${opts.automationId} name=${opts.automationName} activityObjectId=${activityObjectId} matchedOn=${activityObjectId === qa.objectId ? 'objectId' : 'customerKey'}`,
            );
          }
          return true;
        }
      }
    }
    if (opts?.diagnosticsEnabled && comparisonsLogged >= 50) {
      this.logger.warn(
        `[blast-radius] compare: truncated after ${comparisonsLogged} comparisons automationId=${opts.automationId} name=${opts.automationName}`,
      );
    }
    return false;
  }

  private hashSqlText(sqlText: string): string {
    return crypto.createHash('sha256').update(sqlText).digest('hex');
  }
}
