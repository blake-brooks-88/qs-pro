import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  AppError,
  EncryptionService,
  ErrorCode,
  RlsContextService,
} from '@qpp/backend-shared';
import type { IUserRepository } from '@qpp/database';
import type {
  CreateSavedQueryDto,
  UpdateSavedQueryDto,
} from '@qpp/shared-types';
import postgres from 'postgres';

import { FeaturesService } from '../features/features.service';
import type { FoldersRepository } from '../folders/folders.repository';
import type { QueryVersionsRepository } from '../query-versions/query-versions.repository';
import type {
  LinkToQAParams,
  SavedQueriesRepository,
  SavedQuery,
  SavedQueryListItem,
  UpdateSavedQueryParams,
} from './saved-queries.repository';

export interface DecryptedSavedQuery {
  id: string;
  name: string;
  sqlText: string;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
  linkedQaObjectId: string | null;
  linkedQaCustomerKey: string | null;
  linkedQaName: string | null;
  linkedAt: Date | null;
  latestVersionHash: string | null;
  updatedByUserName: string | null;
}

@Injectable()
export class SavedQueriesService {
  constructor(
    @Inject('SAVED_QUERIES_REPOSITORY')
    private readonly savedQueriesRepository: SavedQueriesRepository,
    @Inject('FOLDERS_REPOSITORY')
    private readonly foldersRepository: FoldersRepository,
    @Inject('QUERY_VERSIONS_REPOSITORY')
    private readonly queryVersionsRepository: QueryVersionsRepository,
    @Inject('USER_REPOSITORY')
    private readonly userRepository: IUserRepository,
    private readonly featuresService: FeaturesService,
    private readonly encryptionService: EncryptionService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async create(
    tenantId: string,
    mid: string,
    userId: string,
    dto: CreateSavedQueryDto,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithIsolatedUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        if (dto.folderId) {
          const folder = await this.foldersRepository.findById(dto.folderId);
          if (!folder) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'create_saved_query',
              reason: `Folder not found: ${dto.folderId}`,
            });
          }
        }

        const sqlTextEncrypted = this.encryptionService.encrypt(dto.sqlText);
        if (!sqlTextEncrypted) {
          throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
            reason: 'Failed to encrypt SQL text',
          });
        }

        const query = await this.savedQueriesRepository.create({
          tenantId,
          mid,
          userId,
          name: dto.name,
          sqlTextEncrypted,
          folderId: dto.folderId ?? null,
        });

        await this.queryVersionsRepository.create({
          savedQueryId: query.id,
          tenantId,
          mid,
          userId,
          sqlTextEncrypted,
          sqlTextHash: this.hashSqlText(dto.sqlText),
          lineCount: dto.sqlText.split('\n').length,
          source: 'save',
        });

        return this.decryptQuery(query);
      },
    );
  }

  async findAll(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<DecryptedSavedQuery[]> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        const queries = await this.savedQueriesRepository.findAll(
          userId,
          querySharingEnabled,
        );
        return queries.map((q) => this.decryptQuery(q));
      },
    );
  }

  async findAllListItems(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<SavedQueryListItem[]> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;
        return this.savedQueriesRepository.findAllListItems(
          userId,
          querySharingEnabled,
        );
      },
    );
  }

  async findById(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        const query = await this.savedQueriesRepository.findById(id);
        if (!query || (!querySharingEnabled && query.userId !== userId)) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'find_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }

        const latestVersion =
          await this.queryVersionsRepository.findLatestBySavedQueryId(id);
        const latestVersionHash = latestVersion?.sqlTextHash ?? null;

        const updatedByUserName = await this.resolveUserName(
          query.updatedByUserId,
        );

        return this.decryptQuery(query, {
          latestVersionHash,
          updatedByUserName,
        });
      },
    );
  }

  async update(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
    dto: UpdateSavedQueryDto,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithIsolatedUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        if (!querySharingEnabled) {
          const existing = await this.savedQueriesRepository.findById(id);
          if (existing?.userId !== userId) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'update_saved_query',
              reason: `Saved query not found: ${id}`,
            });
          }
        }

        if (dto.sqlText && dto.expectedHash) {
          const latestVersion =
            await this.queryVersionsRepository.findLatestBySavedQueryId(id);
          if (latestVersion && latestVersion.sqlTextHash !== dto.expectedHash) {
            throw new AppError(ErrorCode.STALE_CONTENT, undefined, {
              reason: 'Query was modified since you opened it',
            });
          }
        }

        if (dto.folderId) {
          const folder = await this.foldersRepository.findById(dto.folderId);
          if (!folder) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'update_saved_query',
              reason: `Folder not found: ${dto.folderId}`,
            });
          }
        }

        const updateParams: UpdateSavedQueryParams = {
          updatedByUserId: userId,
        };
        if (dto.name !== undefined) {
          updateParams.name = dto.name;
        }
        if (dto.sqlText !== undefined) {
          const sqlTextEncrypted = this.encryptionService.encrypt(dto.sqlText);
          if (!sqlTextEncrypted) {
            throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
              reason: 'Failed to encrypt SQL text',
            });
          }
          updateParams.sqlTextEncrypted = sqlTextEncrypted;
        }
        if (dto.folderId !== undefined) {
          updateParams.folderId = dto.folderId;
        }

        const query = await this.savedQueriesRepository.update(
          id,
          updateParams,
        );
        if (!query || (!querySharingEnabled && query.userId !== userId)) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'update_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }

        if (dto.sqlText !== undefined && updateParams.sqlTextEncrypted) {
          const sqlTextHash = this.hashSqlText(dto.sqlText);
          const latestVersion =
            await this.queryVersionsRepository.findLatestBySavedQueryId(id);
          if (latestVersion?.sqlTextHash !== sqlTextHash) {
            await this.queryVersionsRepository.create({
              savedQueryId: id,
              tenantId,
              mid,
              userId,
              sqlTextEncrypted: updateParams.sqlTextEncrypted,
              sqlTextHash,
              lineCount: dto.sqlText.split('\n').length,
              source: 'save',
            });
          }
        }

        const afterVersion =
          await this.queryVersionsRepository.findLatestBySavedQueryId(id);
        const latestVersionHash = afterVersion?.sqlTextHash ?? null;

        const updatedByUserName = await this.resolveUserName(userId);

        return this.decryptQuery(query, {
          latestVersionHash,
          updatedByUserName,
        });
      },
    );
  }

  async delete(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<void> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        if (!querySharingEnabled) {
          const existing = await this.savedQueriesRepository.findById(id);
          if (existing?.userId !== userId) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'delete_saved_query',
              reason: `Saved query not found: ${id}`,
            });
          }
        }

        const deleted = await this.savedQueriesRepository.delete(id);
        if (!deleted) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'delete_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }
      },
    );
  }

  async countByUser(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<number> {
    return this.rlsContext.runWithUserContext(tenantId, mid, userId, () =>
      this.savedQueriesRepository.countByUser(userId),
    );
  }

  async linkToQA(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
    params: LinkToQAParams,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        if (!querySharingEnabled) {
          const existing = await this.savedQueriesRepository.findById(id);
          if (existing?.userId !== userId) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'link_saved_query',
              reason: `Saved query not found: ${id}`,
            });
          }
        }

        const query = await this.linkToQAWithConflictCheck(id, params);
        if (!query || (!querySharingEnabled && query.userId !== userId)) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'link_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }
        return this.decryptQuery(query);
      },
    );
  }

  async updateSqlAndLink(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
    sqlText: string,
    linkParams: LinkToQAParams,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithIsolatedUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        if (!querySharingEnabled) {
          const existing = await this.savedQueriesRepository.findById(id);
          if (existing?.userId !== userId) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'update_and_link_saved_query',
              reason: `Saved query not found: ${id}`,
            });
          }
        }

        const sqlTextEncrypted = this.encryptionService.encrypt(sqlText);
        if (!sqlTextEncrypted) {
          throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
            reason: 'Failed to encrypt SQL text',
          });
        }

        const updated = await this.savedQueriesRepository.update(id, {
          sqlTextEncrypted,
          updatedByUserId: userId,
        });
        if (!updated || (!querySharingEnabled && updated.userId !== userId)) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'update_and_link_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }

        const sqlTextHash = this.hashSqlText(sqlText);
        const latestVersion =
          await this.queryVersionsRepository.findLatestBySavedQueryId(id);
        if (latestVersion?.sqlTextHash !== sqlTextHash) {
          await this.queryVersionsRepository.create({
            savedQueryId: id,
            tenantId,
            mid,
            userId,
            sqlTextEncrypted,
            sqlTextHash,
            lineCount: sqlText.split('\n').length,
            source: 'save',
          });
        }

        const linked = await this.linkToQAWithConflictCheck(id, linkParams);
        if (!linked || (!querySharingEnabled && linked.userId !== userId)) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'update_and_link_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }

        return this.decryptQuery(linked);
      },
    );
  }

  async unlinkFromQA(
    tenantId: string,
    mid: string,
    userId: string,
    id: string,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const { features } =
          await this.featuresService.getTenantFeatures(tenantId);
        const querySharingEnabled = features.querySharing === true;

        if (!querySharingEnabled) {
          const existing = await this.savedQueriesRepository.findById(id);
          if (existing?.userId !== userId) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'unlink_saved_query',
              reason: `Saved query not found: ${id}`,
            });
          }
        }

        const query = await this.savedQueriesRepository.unlinkFromQA(id);
        if (!query || (!querySharingEnabled && query.userId !== userId)) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'unlink_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }
        return this.decryptQuery(query);
      },
    );
  }

  async findAllLinkedQaKeys(
    tenantId: string,
    mid: string,
    userId?: string,
  ): Promise<Map<string, string | null>> {
    return this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      const { features } =
        await this.featuresService.getTenantFeatures(tenantId);
      const querySharingEnabled = features.querySharing === true;

      const rows = await this.savedQueriesRepository.findAllLinkedQaKeys();
      const map = new Map<string, string | null>();
      for (const row of rows) {
        if (!row.linkedQaCustomerKey) {
          continue;
        }

        if (querySharingEnabled || (userId && row.userId === userId)) {
          map.set(row.linkedQaCustomerKey, row.name);
        } else {
          map.set(row.linkedQaCustomerKey, null);
        }
      }
      return map;
    });
  }

  async getLatestVersionSql(
    tenantId: string,
    mid: string,
    userId: string,
    savedQueryId: string,
  ): Promise<{
    versionId: string;
    sqlText: string;
    sqlTextHash: string;
  } | null> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const version =
          await this.queryVersionsRepository.findLatestBySavedQueryId(
            savedQueryId,
          );
        if (!version) {
          return null;
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
          versionId: version.id,
          sqlText,
          sqlTextHash: version.sqlTextHash,
        };
      },
    );
  }

  async getVersionSql(
    tenantId: string,
    mid: string,
    userId: string,
    savedQueryId: string,
    versionId: string,
  ): Promise<{ sqlText: string; sqlTextHash: string } | null> {
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        const version = await this.queryVersionsRepository.findById(versionId);
        if (version?.savedQueryId !== savedQueryId) {
          return null;
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
          sqlText,
          sqlTextHash: version.sqlTextHash,
        };
      },
    );
  }

  private async linkToQAWithConflictCheck(
    id: string,
    params: LinkToQAParams,
  ): Promise<SavedQuery | null> {
    try {
      return await this.savedQueriesRepository.linkToQA(id, params);
    } catch (error) {
      const pgError =
        error instanceof postgres.PostgresError
          ? error
          : error && typeof error === 'object' && 'cause' in error
            ? error.cause
            : null;

      const isUniqueViolation =
        (pgError &&
          typeof pgError === 'object' &&
          'code' in pgError &&
          pgError.code === '23505') ||
        (error instanceof postgres.PostgresError && error.code === '23505');

      if (isUniqueViolation) {
        throw new AppError(ErrorCode.LINK_CONFLICT, undefined, {
          operation: 'link_saved_query',
          reason: `Query Activity ${params.linkedQaCustomerKey} is already linked to another saved query`,
        });
      }
      throw error;
    }
  }

  private hashSqlText(sqlText: string): string {
    return crypto.createHash('sha256').update(sqlText).digest('hex');
  }

  private async resolveUserName(
    userId: string | null | undefined,
  ): Promise<string | null> {
    if (!userId) {
      return null;
    }
    const user = await this.userRepository.findById(userId);
    return user?.name ?? null;
  }

  private decryptQuery(
    query: SavedQuery,
    overrides?: {
      latestVersionHash?: string | null;
      updatedByUserName?: string | null;
    },
  ): DecryptedSavedQuery {
    const sqlText = this.encryptionService.decrypt(query.sqlTextEncrypted);
    if (sqlText === null || sqlText === undefined) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        reason: 'Failed to decrypt SQL text',
      });
    }
    return {
      id: query.id,
      name: query.name,
      sqlText,
      folderId: query.folderId,
      createdAt: query.createdAt,
      updatedAt: query.updatedAt,
      linkedQaObjectId: query.linkedQaObjectId,
      linkedQaCustomerKey: query.linkedQaCustomerKey,
      linkedQaName: query.linkedQaName,
      linkedAt: query.linkedAt,
      latestVersionHash: overrides?.latestVersionHash ?? null,
      updatedByUserName: overrides?.updatedByUserName ?? null,
    };
  }
}
