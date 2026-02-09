import { getDbFromContext } from '@qpp/backend-shared';
import {
  count,
  createDatabaseFromClient,
  eq,
  isNotNull,
  savedQueries,
} from '@qpp/database';

import type {
  CreateSavedQueryParams,
  LinkToQAParams,
  SavedQueriesRepository,
  SavedQuery,
  SavedQueryListItem,
  UpdateSavedQueryParams,
} from './saved-queries.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export class DrizzleSavedQueriesRepository implements SavedQueriesRepository {
  constructor(private readonly db: Database) {}

  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async create(params: CreateSavedQueryParams): Promise<SavedQuery> {
    const results = await this.getDb()
      .insert(savedQueries)
      .values({
        tenantId: params.tenantId,
        mid: params.mid,
        userId: params.userId,
        name: params.name,
        sqlTextEncrypted: params.sqlTextEncrypted,
        folderId: params.folderId ?? null,
      })
      .returning();
    const query = results[0];
    if (!query) {
      throw new Error('Failed to create saved query');
    }
    return query;
  }

  async findById(id: string): Promise<SavedQuery | null> {
    const results = await this.getDb()
      .select()
      .from(savedQueries)
      .where(eq(savedQueries.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  async findAll(): Promise<SavedQuery[]> {
    return this.getDb().select().from(savedQueries);
  }

  async findAllListItems(): Promise<SavedQueryListItem[]> {
    return this.getDb()
      .select({
        id: savedQueries.id,
        name: savedQueries.name,
        folderId: savedQueries.folderId,
        updatedAt: savedQueries.updatedAt,
        linkedQaCustomerKey: savedQueries.linkedQaCustomerKey,
        linkedQaName: savedQueries.linkedQaName,
        linkedAt: savedQueries.linkedAt,
      })
      .from(savedQueries);
  }

  async update(
    id: string,
    params: UpdateSavedQueryParams,
  ): Promise<SavedQuery | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (params.name !== undefined) {
      updateData.name = params.name;
    }
    if (params.sqlTextEncrypted !== undefined) {
      updateData.sqlTextEncrypted = params.sqlTextEncrypted;
    }
    if (params.folderId !== undefined) {
      updateData.folderId = params.folderId;
    }

    const results = await this.getDb()
      .update(savedQueries)
      .set(updateData)
      .where(eq(savedQueries.id, id))
      .returning();
    return results[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.getDb()
      .delete(savedQueries)
      .where(eq(savedQueries.id, id))
      .returning({ id: savedQueries.id });
    return result.length > 0;
  }

  async countByUser(): Promise<number> {
    const results = await this.getDb()
      .select({ count: count() })
      .from(savedQueries);
    return results[0]?.count ?? 0;
  }

  async linkToQA(
    id: string,
    params: LinkToQAParams,
  ): Promise<SavedQuery | null> {
    const results = await this.getDb()
      .update(savedQueries)
      .set({
        linkedQaObjectId: params.linkedQaObjectId,
        linkedQaCustomerKey: params.linkedQaCustomerKey,
        linkedQaName: params.linkedQaName,
        linkedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(savedQueries.id, id))
      .returning();
    return results[0] ?? null;
  }

  async unlinkFromQA(id: string): Promise<SavedQuery | null> {
    const results = await this.getDb()
      .update(savedQueries)
      .set({
        linkedQaObjectId: null,
        linkedQaCustomerKey: null,
        linkedQaName: null,
        linkedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(savedQueries.id, id))
      .returning();
    return results[0] ?? null;
  }

  async findAllLinkedQaKeys(): Promise<Map<string, string>> {
    const rows = await this.getDb()
      .select({
        linkedQaCustomerKey: savedQueries.linkedQaCustomerKey,
        name: savedQueries.name,
      })
      .from(savedQueries)
      .where(isNotNull(savedQueries.linkedQaCustomerKey));

    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.linkedQaCustomerKey) {
        map.set(row.linkedQaCustomerKey, row.name);
      }
    }
    return map;
  }
}
