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
  updatedByUserId?: string;
}

export interface LinkToQAParams {
  linkedQaObjectId: string;
  linkedQaCustomerKey: string;
  linkedQaName: string;
}

export interface SavedQueryListItem {
  id: string;
  name: string;
  folderId: string | null;
  updatedAt: Date;
  linkedQaCustomerKey: string | null;
  linkedQaName: string | null;
  linkedAt: Date | null;
  updatedByUserName: string | null;
}

export interface SavedQueriesRepository {
  create(params: CreateSavedQueryParams): Promise<SavedQuery>;
  findById(id: string): Promise<SavedQuery | null>;
  findAll(userId: string, querySharingEnabled: boolean): Promise<SavedQuery[]>;
  findAllListItems(
    userId: string,
    querySharingEnabled: boolean,
  ): Promise<SavedQueryListItem[]>;
  update(
    id: string,
    params: UpdateSavedQueryParams,
  ): Promise<SavedQuery | null>;
  delete(id: string): Promise<boolean>;
  countByUser(userId: string): Promise<number>;
  linkToQA(id: string, params: LinkToQAParams): Promise<SavedQuery | null>;
  unlinkFromQA(id: string): Promise<SavedQuery | null>;
  findAllLinkedQaKeys(): Promise<
    Array<{
      linkedQaCustomerKey: string;
      name: string;
      userId: string;
    }>
  >;
}
