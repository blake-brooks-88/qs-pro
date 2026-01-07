// =============================================================================
// Data Types
// =============================================================================

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

export interface DataExtensionField {
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
  fields: DataExtensionField[];
}

export type QueryStatus = 'running' | 'success' | 'error' | 'idle';

export interface ExecutionResult {
  status: QueryStatus;
  runtime: string;
  totalRows: number;
  currentPage: number;
  pageSize: number;
  columns: string[];
  rows: Record<string, any>[];
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

export interface QueryTab {
  id: string;
  queryId?: string;
  name: string;
  content: string;
  isDirty: boolean;
  isNew?: boolean;
}

// =============================================================================
// Component Props
// =============================================================================

export interface EditorWorkspaceProps {
  /** Folders for sidebar organization */
  folders: Folder[];
  /** User's saved query library */
  savedQueries: SavedQuery[];
  /** Marketing Cloud data extensions */
  dataExtensions: DataExtension[];
  /** Current active query result */
  executionResult: ExecutionResult;
  /** Initial open tabs */
  initialTabs?: QueryTab[];
  /** Whether the sidebar is collapsed */
  isSidebarCollapsed: boolean;

  /** Callbacks for main editor actions */
  onRun?: (mode: 'temp' | 'target') => void;
  onSave?: (tabId: string, content: string) => void;
  onSaveAs?: (tabId: string, name: string, folderId: string) => void;
  onFormat?: () => void;
  onDeploy?: (queryId: string) => void;
  onCreateQueryActivity?: (draft: QueryActivityDraft) => void;
  
  /** Callbacks for sidebar interaction */
  onSelectQuery?: (id: string) => void;
  onSelectDE?: (id: string) => void;
  onToggleSidebar?: () => void;
  onSearch?: (term: string) => void;
  
  /** Callbacks for modals */
  onCreateDE?: () => void;
  onOpenSettings?: () => void;
  
  /** Callbacks for results pagination */
  onPageChange?: (page: number) => void;
  onViewInContactBuilder?: (customerKey: string) => void;

  /** Tab management callbacks */
  onTabClose?: (tabId: string) => void;
  onTabChange?: (tabId: string) => void;
  onNewTab?: () => void;
}
