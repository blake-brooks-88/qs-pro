import * as crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  AppError,
  DataExtensionService,
  ErrorCode,
  MetadataService,
  QueryDefinitionService,
} from '@qpp/backend-shared';
import type {
  CreateQueryActivityDto,
  LinkQueryResponse,
  QADetail,
  QAListItem,
} from '@qpp/shared-types';

import { SavedQueriesService } from '../saved-queries/saved-queries.service';

@Injectable()
export class QueryActivitiesService {
  constructor(
    private readonly dataExtensionService: DataExtensionService,
    private readonly queryDefinitionService: QueryDefinitionService,
    private readonly metadataService: MetadataService,
    private readonly savedQueriesService: SavedQueriesService,
  ) {}

  async listAllWithLinkStatus(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<QAListItem[]> {
    const [qaList, linkedMap] = await Promise.all([
      this.queryDefinitionService.retrieveAll(tenantId, userId, mid),
      this.savedQueriesService.findAllLinkedQaKeys(tenantId, mid, userId),
    ]);

    return qaList.map((qa) => ({
      objectId: qa.objectId,
      customerKey: qa.customerKey,
      name: qa.name,
      categoryId: qa.categoryId,
      targetUpdateType: qa.targetUpdateType,
      modifiedDate: qa.modifiedDate,
      status: qa.status,
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

    let sqlUpdated = false;

    if (conflictResolution === 'keep-remote' && qaDetail.queryText) {
      await this.savedQueriesService.update(
        tenantId,
        mid,
        userId,
        savedQueryId,
        { sqlText: qaDetail.queryText },
      );
      sqlUpdated = true;
    }

    const linked = await this.savedQueriesService.linkToQA(
      tenantId,
      mid,
      userId,
      savedQueryId,
      {
        linkedQaObjectId: qaDetail.objectId,
        linkedQaCustomerKey: qaDetail.customerKey,
        linkedQaName: qaDetail.name,
      },
    );

    return {
      linkedQaObjectId: linked.linkedQaObjectId ?? qaDetail.objectId,
      linkedQaCustomerKey: linked.linkedQaCustomerKey ?? qaDetail.customerKey,
      linkedQaName: linked.linkedQaName ?? qaDetail.name,
      linkedAt: (linked.linkedAt ?? new Date()).toISOString(),
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
}
