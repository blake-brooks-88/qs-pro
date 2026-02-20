import type { folders } from '@qpp/database';

export type Folder = typeof folders.$inferSelect;

export interface CreateFolderParams {
  tenantId: string;
  mid: string;
  userId: string;
  name: string;
  parentId?: string | null;
  visibility?: 'personal' | 'shared';
}

export interface UpdateFolderParams {
  name?: string;
  parentId?: string | null;
  visibility?: 'personal' | 'shared';
}

export interface FoldersRepository {
  create(params: CreateFolderParams): Promise<Folder>;
  findById(id: string): Promise<Folder | null>;
  findAll(): Promise<Folder[]>;
  update(id: string, params: UpdateFolderParams): Promise<Folder | null>;
  delete(id: string): Promise<boolean>;
  countByUser(): Promise<number>;
  hasChildren(id: string): Promise<boolean>;
  wouldCreateCycle(
    folderId: string,
    proposedParentId: string,
  ): Promise<boolean>;
}
