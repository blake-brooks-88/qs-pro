export interface RowsetItem {
  keys?: Record<string, unknown>;
  values?: Record<string, unknown>;
}

export interface RowsetResponse {
  count?: number;
  page?: number;
  pageSize?: number;
  items?: RowsetItem[];
}
