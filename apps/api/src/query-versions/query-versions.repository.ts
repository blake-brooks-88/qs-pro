import type { queryVersions } from '@qpp/database';

export type QueryVersion = typeof queryVersions.$inferSelect;

export type QueryVersionWithAuthor = QueryVersion & {
  authorName: string | null;
};

export interface CreateQueryVersionParams {
  savedQueryId: string;
  tenantId: string;
  mid: string;
  userId: string;
  sqlTextEncrypted: string;
  sqlTextHash: string;
  lineCount: number;
  source: 'save' | 'restore';
  restoredFromId?: string | null;
  versionName?: string | null;
}

export interface QueryVersionsRepository {
  create(params: CreateQueryVersionParams): Promise<QueryVersion>;
  findById(id: string): Promise<QueryVersion | null>;
  findBySavedQueryId(savedQueryId: string): Promise<QueryVersionWithAuthor[]>;
  findLatestBySavedQueryId(savedQueryId: string): Promise<QueryVersion | null>;
  updateName(
    id: string,
    versionName: string | null,
  ): Promise<QueryVersion | null>;
}
