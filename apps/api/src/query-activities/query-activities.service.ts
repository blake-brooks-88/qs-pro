import * as crypto from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  AppError,
  DataExtensionService,
  ErrorCode,
  MetadataService,
  QueryDefinitionService,
} from '@qpp/backend-shared';
import type { CreateQueryActivityDto } from '@qpp/shared-types';

@Injectable()
export class QueryActivitiesService {
  constructor(
    private readonly dataExtensionService: DataExtensionService,
    private readonly queryDefinitionService: QueryDefinitionService,
    private readonly metadataService: MetadataService,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    mid: string,
    dto: CreateQueryActivityDto,
  ): Promise<{ objectId: string }> {
    // 1. Validate target DE exists (pass eid for Shared DE context)
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

    // 1b. Validate Primary Key requirement for Update mode
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

    // 2. Check name uniqueness in folder
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

    // 3. Generate or validate customerKey
    const customerKey =
      dto.customerKey?.trim() || crypto.randomUUID().toUpperCase();

    // 4. Check customerKey uniqueness if provided by user
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

    return this.queryDefinitionService.create(tenantId, userId, mid, {
      name: dto.name,
      customerKey,
      categoryId: dto.categoryId,
      targetId: targetDE.objectId,
      targetCustomerKey: targetDE.customerKey,
      targetName: targetDE.name,
      queryText: dto.queryText,
      description: dto.description,
      targetUpdateType: dto.targetUpdateType,
    });
  }
}
