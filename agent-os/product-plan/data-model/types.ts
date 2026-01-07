export type FolderType = 'library' | 'data-extension';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  type: FolderType;
}

export interface SavedQuery {
  id: string;
  name: string;
  folderId: string;
  content: string;
  updatedAt: string;
}

export type SFMCFieldType = 'Text' | 'Number' | 'Date' | 'Boolean' | 'Email' | 'Phone' | 'Decimal';

export interface Field {
  name: string;
  type: SFMCFieldType;
  length?: number;
  isPrimaryKey: boolean;
  isNullable: boolean;
}

export interface DataExtension {
  id: string;
  name: string;
  customerKey: string;
  folderId: string;
  description: string;
  fields: Field[];
}

export type QueryStatus = 'running' | 'success' | 'error' | 'idle';

export interface ExecutionResult {
  status: QueryStatus;
  runtime: string;
  totalRows: number;
  currentPage: number;
  pageSize: number;
  columns: string[];
  rows: Record<string, unknown>[];
  errorMessage?: string;
}

export type QueryDataAction = 'Overwrite' | 'Append' | 'Update';

export interface QueryActivityDraft {
  name: string;
  externalKey?: string;
  description?: string;
  targetDataExtensionId: string;
  dataAction: QueryDataAction;
}

