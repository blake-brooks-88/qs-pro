import { getDbFromContext } from '@qpp/backend-shared';
import {
  createDatabaseFromClient,
  desc,
  eq,
  queryVersions,
} from '@qpp/database';

import type {
  CreateQueryVersionParams,
  QueryVersion,
  QueryVersionsRepository,
} from './query-versions.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export class DrizzleQueryVersionsRepository implements QueryVersionsRepository {
  constructor(private readonly db: Database) {}

  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async create(params: CreateQueryVersionParams): Promise<QueryVersion> {
    const results = await this.getDb()
      .insert(queryVersions)
      .values({
        savedQueryId: params.savedQueryId,
        tenantId: params.tenantId,
        mid: params.mid,
        userId: params.userId,
        sqlTextEncrypted: params.sqlTextEncrypted,
        sqlTextHash: params.sqlTextHash,
        lineCount: params.lineCount,
        source: params.source,
        restoredFromId: params.restoredFromId ?? null,
        versionName: params.versionName ?? null,
      })
      .returning();
    const version = results[0];
    if (!version) {
      throw new Error('Failed to create query version');
    }
    return version;
  }

  async findById(id: string): Promise<QueryVersion | null> {
    const results = await this.getDb()
      .select()
      .from(queryVersions)
      .where(eq(queryVersions.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  async findBySavedQueryId(savedQueryId: string): Promise<QueryVersion[]> {
    return this.getDb()
      .select()
      .from(queryVersions)
      .where(eq(queryVersions.savedQueryId, savedQueryId))
      .orderBy(desc(queryVersions.createdAt));
  }

  async findLatestBySavedQueryId(
    savedQueryId: string,
  ): Promise<QueryVersion | null> {
    const results = await this.getDb()
      .select()
      .from(queryVersions)
      .where(eq(queryVersions.savedQueryId, savedQueryId))
      .orderBy(desc(queryVersions.createdAt))
      .limit(1);
    return results[0] ?? null;
  }

  async updateName(
    id: string,
    versionName: string | null,
  ): Promise<QueryVersion | null> {
    const results = await this.getDb()
      .update(queryVersions)
      .set({ versionName })
      .where(eq(queryVersions.id, id))
      .returning();
    return results[0] ?? null;
  }
}
