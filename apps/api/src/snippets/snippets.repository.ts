import type { snippets } from '@qpp/database';

export type Snippet = typeof snippets.$inferSelect;

export interface CreateSnippetParams {
  tenantId: string;
  mid: string;
  userId: string;
  title: string;
  triggerPrefix: string;
  code: string;
  description?: string | null;
  scope?: string;
}

export interface UpdateSnippetParams {
  title?: string;
  triggerPrefix?: string;
  code?: string;
  description?: string | null;
  scope?: string;
  updatedByUserId?: string;
}

export interface SnippetListItem {
  id: string;
  title: string;
  triggerPrefix: string;
  code: string;
  description: string | null;
  scope: string;
  createdByUserName: string | null;
  updatedByUserName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SnippetsRepository {
  create(params: CreateSnippetParams): Promise<Snippet>;
  findById(id: string): Promise<Snippet | null>;
  findAll(): Promise<SnippetListItem[]>;
  update(id: string, params: UpdateSnippetParams): Promise<Snippet | null>;
  delete(id: string): Promise<boolean>;
}
