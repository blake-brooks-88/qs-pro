import { Inject, Injectable } from '@nestjs/common';
import {
  AppError,
  EncryptionService,
  ErrorCode,
  RlsContextService,
} from '@qpp/backend-shared';
import type {
  UpdateVersionNameDto,
  VersionDetail,
  VersionListItem,
  VersionListResponse,
} from '@qpp/shared-types';

import { FeaturesService } from '../features/features.service';
import type {
  SavedQueriesRepository,
  UpdateSavedQueryParams,
} from '../saved-queries/saved-queries.repository';
import type { QueryVersionsRepository } from './query-versions.repository';

@Injectable()
export class QueryVersionsService {
  constructor(
    @Inject('QUERY_VERSIONS_REPOSITORY')
    private readonly queryVersionsRepository: QueryVersionsRepository,
    @Inject('SAVED_QUERIES_REPOSITORY')
    private readonly savedQueriesRepository: SavedQueriesRepository,
    private readonly encryptionService: EncryptionService,
    private readonly rlsContext: RlsContextService,
    private readonly featuresService: FeaturesService,
  ) {}

  async listVersions(
    tenantId: string,
    mid: string,
    userId: string,
    savedQueryId: string,
  ): Promise<VersionListResponse> {
    await this.assertFeatureEnabled(tenantId);

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const savedQuery =
          await this.savedQueriesRepository.findById(savedQueryId);
        if (!savedQuery) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'listVersions',
            reason: `Saved query not found: ${savedQueryId}`,
          });
        }

        const versions =
          await this.queryVersionsRepository.findBySavedQueryId(savedQueryId);

        const items: VersionListItem[] = versions.map((v) => ({
          id: v.id,
          savedQueryId: v.savedQueryId,
          lineCount: v.lineCount,
          source: v.source,
          restoredFromId: v.restoredFromId,
          versionName: v.versionName,
          createdAt: v.createdAt.toISOString(),
        }));

        return { versions: items, total: items.length };
      },
    );
  }

  async getVersionDetail(
    tenantId: string,
    mid: string,
    userId: string,
    savedQueryId: string,
    versionId: string,
  ): Promise<VersionDetail> {
    await this.assertFeatureEnabled(tenantId);

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const version = await this.queryVersionsRepository.findById(versionId);
        if (version?.savedQueryId !== savedQueryId) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'getVersionDetail',
            reason: `Version not found: ${versionId}`,
          });
        }

        const sqlText = this.encryptionService.decrypt(
          version.sqlTextEncrypted,
        );
        if (sqlText === null || sqlText === undefined) {
          throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
            reason: 'Failed to decrypt version SQL text',
          });
        }

        return {
          id: version.id,
          savedQueryId: version.savedQueryId,
          sqlText,
          lineCount: version.lineCount,
          source: version.source,
          restoredFromId: version.restoredFromId,
          versionName: version.versionName,
          createdAt: version.createdAt.toISOString(),
        };
      },
    );
  }

  async restore(
    tenantId: string,
    mid: string,
    userId: string,
    savedQueryId: string,
    versionId: string,
  ): Promise<VersionDetail> {
    await this.assertFeatureEnabled(tenantId);

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const version = await this.queryVersionsRepository.findById(versionId);
        if (version?.savedQueryId !== savedQueryId) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'restore',
            reason: `Version not found: ${versionId}`,
          });
        }

        const restoredVersion = await this.queryVersionsRepository.create({
          savedQueryId,
          tenantId,
          mid,
          userId,
          sqlTextEncrypted: version.sqlTextEncrypted,
          sqlTextHash: version.sqlTextHash,
          lineCount: version.lineCount,
          source: 'restore',
          restoredFromId: versionId,
          versionName: `Restored from ${version.createdAt.toISOString()}`,
        });

        const updateParams: UpdateSavedQueryParams = {
          sqlTextEncrypted: version.sqlTextEncrypted,
        };
        await this.savedQueriesRepository.update(savedQueryId, updateParams);

        const sqlText = this.encryptionService.decrypt(
          restoredVersion.sqlTextEncrypted,
        );
        if (sqlText === null || sqlText === undefined) {
          throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
            reason: 'Failed to decrypt restored version SQL text',
          });
        }

        return {
          id: restoredVersion.id,
          savedQueryId: restoredVersion.savedQueryId,
          sqlText,
          lineCount: restoredVersion.lineCount,
          source: restoredVersion.source,
          restoredFromId: restoredVersion.restoredFromId,
          versionName: restoredVersion.versionName,
          createdAt: restoredVersion.createdAt.toISOString(),
        };
      },
    );
  }

  async updateName(
    tenantId: string,
    mid: string,
    userId: string,
    savedQueryId: string,
    versionId: string,
    dto: UpdateVersionNameDto,
  ): Promise<VersionListItem> {
    await this.assertFeatureEnabled(tenantId);

    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const version = await this.queryVersionsRepository.findById(versionId);
        if (version?.savedQueryId !== savedQueryId) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'updateName',
            reason: `Version not found: ${versionId}`,
          });
        }

        const updated = await this.queryVersionsRepository.updateName(
          versionId,
          dto.versionName,
        );
        if (!updated) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'updateName',
            reason: `Version not found after update: ${versionId}`,
          });
        }

        return {
          id: updated.id,
          savedQueryId: updated.savedQueryId,
          lineCount: updated.lineCount,
          source: updated.source,
          restoredFromId: updated.restoredFromId,
          versionName: updated.versionName,
          createdAt: updated.createdAt.toISOString(),
        };
      },
    );
  }

  private async assertFeatureEnabled(tenantId: string): Promise<void> {
    const { features } = await this.featuresService.getTenantFeatures(tenantId);
    if (!features.versionHistory) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'queryVersions',
        reason: 'Version History requires Pro subscription',
      });
    }
  }
}
