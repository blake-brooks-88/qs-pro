import * as crypto from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import {
  AppError,
  EncryptionService,
  ErrorCode,
  RlsContextService,
} from '@qpp/backend-shared';
import type {
  CreateSavedQueryDto,
  UpdateSavedQueryDto,
} from '@qpp/shared-types';

import type { FoldersRepository } from '../folders/folders.repository';
import type { QueryVersionsRepository } from '../query-versions/query-versions.repository';
import type {
  SavedQueriesRepository,
  SavedQuery,
  UpdateSavedQueryParams,
} from './saved-queries.repository';

export interface DecryptedSavedQuery {
  id: string;
  name: string;
  sqlText: string;
  folderId: string | null;
  createdAt: Date;
  updatedAt: Date;
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
    private readonly encryptionService: EncryptionService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async create(
    tenantId: string,
    mid: string,
    userId: string,
    dto: CreateSavedQueryDto,
  ): Promise<DecryptedSavedQuery> {
    return this.rlsContext.runWithUserContext(
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
        const queries = await this.savedQueriesRepository.findAll();
        return queries.map((q) => this.decryptQuery(q));
      },
    );
  }

  async findAllListItems(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<
    { id: string; name: string; folderId: string | null; updatedAt: Date }[]
  > {
    return this.rlsContext.runWithUserContext(tenantId, mid, userId, () =>
      this.savedQueriesRepository.findAllListItems(),
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
        const query = await this.savedQueriesRepository.findById(id);
        if (!query) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'find_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }
        return this.decryptQuery(query);
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
    return this.rlsContext.runWithUserContext(
      tenantId,
      mid,
      userId,
      async () => {
        if (dto.folderId) {
          const folder = await this.foldersRepository.findById(dto.folderId);
          if (!folder) {
            throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
              operation: 'update_saved_query',
              reason: `Folder not found: ${dto.folderId}`,
            });
          }
        }

        const updateParams: UpdateSavedQueryParams = {};
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

          const sqlTextHash = this.hashSqlText(dto.sqlText);
          const latestVersion =
            await this.queryVersionsRepository.findLatestBySavedQueryId(id);
          if (!latestVersion || latestVersion.sqlTextHash !== sqlTextHash) {
            await this.queryVersionsRepository.create({
              savedQueryId: id,
              tenantId,
              mid,
              userId,
              sqlTextEncrypted,
              sqlTextHash,
              lineCount: dto.sqlText.split('\n').length,
              source: 'save',
            });
          }
        }
        if (dto.folderId !== undefined) {
          updateParams.folderId = dto.folderId;
        }

        const query = await this.savedQueriesRepository.update(
          id,
          updateParams,
        );
        if (!query) {
          throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
            operation: 'update_saved_query',
            reason: `Saved query not found: ${id}`,
          });
        }
        return this.decryptQuery(query);
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
      this.savedQueriesRepository.countByUser(),
    );
  }

  private hashSqlText(sqlText: string): string {
    return crypto.createHash('sha256').update(sqlText).digest('hex');
  }

  private decryptQuery(query: SavedQuery): DecryptedSavedQuery {
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
    };
  }
}
