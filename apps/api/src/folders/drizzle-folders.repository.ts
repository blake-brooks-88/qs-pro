import { getDbFromContext } from '@qpp/backend-shared';
import {
  count,
  createDatabaseFromClient,
  eq,
  folders,
  savedQueries,
  sql,
  users,
} from '@qpp/database';

import type {
  CreateFolderParams,
  Folder,
  FoldersRepository,
  UpdateFolderParams,
} from './folders.repository';

type Database = ReturnType<typeof createDatabaseFromClient>;

export class DrizzleFoldersRepository implements FoldersRepository {
  constructor(private readonly db: Database) {}

  private getDb(): Database {
    return (getDbFromContext() as Database) ?? this.db;
  }

  async create(params: CreateFolderParams): Promise<Folder> {
    const result = await this.getDb()
      .insert(folders)
      .values({
        tenantId: params.tenantId,
        mid: params.mid,
        userId: params.userId,
        name: params.name,
        parentId: params.parentId ?? null,
        visibility: params.visibility ?? 'personal',
      })
      .returning();
    const folder = result[0];
    if (!folder) {
      throw new Error('Failed to create folder');
    }
    return { ...folder, creatorName: null };
  }

  async findById(id: string): Promise<Folder | null> {
    const rows = await this.getDb()
      .select({
        id: folders.id,
        tenantId: folders.tenantId,
        mid: folders.mid,
        userId: folders.userId,
        parentId: folders.parentId,
        name: folders.name,
        visibility: folders.visibility,
        creatorName: users.name,
        createdAt: folders.createdAt,
        updatedAt: folders.updatedAt,
      })
      .from(folders)
      .leftJoin(users, eq(folders.userId, users.id))
      .where(eq(folders.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      ...row,
      creatorName: row.creatorName ?? null,
    };
  }

  async findAll(): Promise<Folder[]> {
    const rows = await this.getDb()
      .select({
        id: folders.id,
        tenantId: folders.tenantId,
        mid: folders.mid,
        userId: folders.userId,
        parentId: folders.parentId,
        name: folders.name,
        visibility: folders.visibility,
        creatorName: users.name,
        createdAt: folders.createdAt,
        updatedAt: folders.updatedAt,
      })
      .from(folders)
      .leftJoin(users, eq(folders.userId, users.id));

    return rows.map((row) => ({
      ...row,
      creatorName: row.creatorName ?? null,
    }));
  }

  async update(id: string, params: UpdateFolderParams): Promise<Folder | null> {
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (params.name !== undefined) {
      updateData.name = params.name;
    }
    if (params.parentId !== undefined) {
      updateData.parentId = params.parentId;
    }
    if (params.visibility !== undefined) {
      updateData.visibility = params.visibility;
    }

    const [updatedRow] = await this.getDb()
      .update(folders)
      .set(updateData)
      .where(eq(folders.id, id))
      .returning();

    if (!updatedRow) {
      return null;
    }

    const rows = await this.getDb()
      .select({
        id: folders.id,
        tenantId: folders.tenantId,
        mid: folders.mid,
        userId: folders.userId,
        parentId: folders.parentId,
        name: folders.name,
        visibility: folders.visibility,
        creatorName: users.name,
        createdAt: folders.createdAt,
        updatedAt: folders.updatedAt,
      })
      .from(folders)
      .leftJoin(users, eq(folders.userId, users.id))
      .where(eq(folders.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      ...row,
      creatorName: row.creatorName ?? null,
    };
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.getDb()
      .delete(folders)
      .where(eq(folders.id, id))
      .returning({ id: folders.id });
    return result.length > 0;
  }

  async countByUser(): Promise<number> {
    const [result] = await this.getDb()
      .select({ count: count() })
      .from(folders);
    return result?.count ?? 0;
  }

  async hasChildren(id: string): Promise<boolean> {
    const [childFolder] = await this.getDb()
      .select({ id: folders.id })
      .from(folders)
      .where(eq(folders.parentId, id))
      .limit(1);
    if (childFolder) {
      return true;
    }

    const [childQuery] = await this.getDb()
      .select({ id: savedQueries.id })
      .from(savedQueries)
      .where(eq(savedQueries.folderId, id))
      .limit(1);
    return !!childQuery;
  }

  async wouldCreateCycle(
    folderId: string,
    proposedParentId: string,
  ): Promise<boolean> {
    const result = await this.getDb().execute(sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id
        FROM folders
        WHERE id = ${proposedParentId}::uuid
        UNION ALL
        SELECT f.id, f.parent_id
        FROM folders f
        JOIN ancestors a ON f.id = a.parent_id
      ) CYCLE id SET is_cycle USING path
      SELECT EXISTS (
        SELECT 1 FROM ancestors WHERE id = ${folderId}::uuid
      ) AS would_cycle
    `);
    const row = result[0] as { would_cycle: boolean } | undefined;
    return row?.would_cycle ?? false;
  }
}
