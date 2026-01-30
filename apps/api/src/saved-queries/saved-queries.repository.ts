import type { savedQueries } from '@qpp/database';

export type SavedQuery = typeof savedQueries.$inferSelect;

export interface CreateSavedQueryParams {
  tenantId: string;
  mid: string;
  userId: string;
  name: string;
  sqlTextEncrypted: string;
  folderId?: string | null;
}

export interface UpdateSavedQueryParams {
  name?: string;
  sqlTextEncrypted?: string;
  folderId?: string | null;
}

export interface SavedQueriesRepository {
  create(params: CreateSavedQueryParams): Promise<SavedQuery>;
  findById(id: string): Promise<SavedQuery | null>;
  findAll(): Promise<SavedQuery[]>;
  update(id: string, params: UpdateSavedQueryParams): Promise<SavedQuery | null>;
  delete(id: string): Promise<boolean>;
  countByUser(): Promise<number>;
}
