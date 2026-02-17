import type { DataRetentionPolicy } from "@qpp/shared-types";

export type FolderType = "library" | "data-extension" | "queryactivity";

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
  linkedQaCustomerKey: string | null;
  linkedQaName: string | null;
  linkedAt: string | null;
}

export type SFMCFieldType =
  | "Text"
  | "Number"
  | "Date"
  | "Boolean"
  | "EmailAddress"
  | "Phone"
  | "Decimal"
  | "Locale";

export interface DataExtensionField {
  /** Client-generated ID for React key prop when editing. Not persisted to server. */
  id?: string;
  name: string;
  type: SFMCFieldType;
  length?: number;
  scale?: number;
  precision?: number;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue?: string;
}

export interface DataExtension {
  id: string;
  name: string;
  customerKey: string;
  folderId: string;
  description: string;
  fields: DataExtensionField[];
  isShared: boolean;
}

export type QueryStatus = "running" | "success" | "error" | "idle";

export type ExecutionStatus =
  | "idle"
  | "queued"
  | "running"
  | "creating_data_extension"
  | "targeting_data_extension"
  | "validating_query"
  | "executing_query"
  | "fetching_results"
  | "ready"
  | "failed"
  | "canceled";

export type ExecutionCell = string | number | boolean | null;

export interface ExecutionResult {
  status: QueryStatus;
  executionStatus?: ExecutionStatus;
  statusMessage?: string;
  runId?: string;
  runtime: string;
  totalRows: number;
  currentPage: number;
  pageSize: number;
  columns: string[];
  rows: Record<string, ExecutionCell>[];
  errorMessage?: string;
}

export type TargetUpdateType = "Overwrite" | "Append" | "Update";

export interface QueryActivityDraft {
  name: string;
  externalKey?: string;
  description?: string;
  targetDataExtensionCustomerKey: string;
  targetUpdateType: TargetUpdateType;
  categoryId?: number;
  queryText: string;
}

export interface QueryTab {
  id: string;
  queryId?: string;
  name: string;
  content: string;
  isDirty: boolean;
  isNew?: boolean;
  linkedQaCustomerKey?: string | null;
  linkedQaName?: string | null;
}

export interface DataExtensionDraft {
  name: string;
  customerKey?: string;
  folderId: string;
  isSendable: boolean;
  subscriberKeyField?: string;
  retention?: DataRetentionPolicy;
  fields: DataExtensionField[];
}

export interface EditorWorkspaceProps {
  tenantId?: string | null;
  eid?: string;
  folders: Folder[];
  savedQueries?: SavedQuery[];
  dataExtensions: DataExtension[];
  executionResult: ExecutionResult;
  initialTabs?: QueryTab[];
  isSidebarCollapsed: boolean;
  isDataExtensionsFetching?: boolean;
  guardrailMessage?: string;
  guardrailTitle?: string;
  onSave?: (tabId: string, content: string) => void;
  onSaveAs?: (tabId: string, name: string, folderId: string) => void;
  onDeploy?: (queryId: string) => void;
  onCreateQueryActivity?: (draft: QueryActivityDraft) => void;
  onSelectQuery?: (id: string) => void;
  onSelectDE?: (id: string) => void;
  onToggleSidebar?: () => void;
  onSearch?: (term: string) => void;
  onCreateDE?: () => void;
  onOpenSettings?: () => void;
  onPageChange?: (page: number) => void;
  onViewInContactBuilder?: (customerKey: string) => void;
  onTabClose?: (tabId: string) => void;
  onTabChange?: (tabId: string) => void;
  onNewTab?: () => void;
}
