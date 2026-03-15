import { getDbFromContext } from '@qpp/backend-shared';
import { createDatabaseFromClient, eq, snippets, users } from '@qpp/database';
import { alias } from 'drizzle-orm/pg-core';

import type {
  CreateSnippetParams,
  Snippet,
  SnippetListItem,
  SnippetsRepository,
  UpdateSnippetParams,
} from './snippets.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

const creatorUser = alias(users, 'creator_user');
const updaterUser = alias(users, 'updater_user');

export class DrizzleSnippetsRepository implements SnippetsRepository {
  constructor(private readonly db: Database) {}

  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async create(params: CreateSnippetParams): Promise<Snippet> {
    const results = await this.getDb()
      .insert(snippets)
      .values({
        tenantId: params.tenantId,
        mid: params.mid,
        userId: params.userId,
        title: params.title,
        triggerPrefix: params.triggerPrefix,
        code: params.code,
        description: params.description ?? null,
        scope: params.scope ?? 'bu',
      })
      .returning();
    const snippet = results[0];
    if (!snippet) {
      throw new Error('Failed to create snippet');
    }
    return snippet;
  }

  async findById(id: string): Promise<Snippet | null> {
    const results = await this.getDb()
      .select()
      .from(snippets)
      .where(eq(snippets.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  async findAll(): Promise<SnippetListItem[]> {
    const rows = await this.getDb()
      .select({
        id: snippets.id,
        title: snippets.title,
        triggerPrefix: snippets.triggerPrefix,
        code: snippets.code,
        description: snippets.description,
        scope: snippets.scope,
        createdByUserName: creatorUser.name,
        updatedByUserName: updaterUser.name,
        createdAt: snippets.createdAt,
        updatedAt: snippets.updatedAt,
      })
      .from(snippets)
      .leftJoin(creatorUser, eq(snippets.userId, creatorUser.id))
      .leftJoin(updaterUser, eq(snippets.updatedByUserId, updaterUser.id))
      .orderBy(snippets.createdAt);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      triggerPrefix: row.triggerPrefix,
      code: row.code,
      description: row.description,
      scope: row.scope,
      createdByUserName: row.createdByUserName ?? null,
      updatedByUserName: row.updatedByUserName ?? null,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    }));
  }

  async update(
    id: string,
    params: UpdateSnippetParams,
  ): Promise<Snippet | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (params.title !== undefined) {
      updateData.title = params.title;
    }
    if (params.triggerPrefix !== undefined) {
      updateData.triggerPrefix = params.triggerPrefix;
    }
    if (params.code !== undefined) {
      updateData.code = params.code;
    }
    if (params.description !== undefined) {
      updateData.description = params.description;
    }
    if (params.scope !== undefined) {
      updateData.scope = params.scope;
    }
    if (params.updatedByUserId !== undefined) {
      updateData.updatedByUserId = params.updatedByUserId;
    }

    const results = await this.getDb()
      .update(snippets)
      .set(updateData)
      .where(eq(snippets.id, id))
      .returning();
    return results[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.getDb()
      .delete(snippets)
      .where(eq(snippets.id, id))
      .returning({ id: snippets.id });
    return result.length > 0;
  }
}
