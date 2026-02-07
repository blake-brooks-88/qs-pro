import type { shellQueryRuns } from '@qpp/database';

export type ShellQueryRun = typeof shellQueryRuns.$inferSelect;
export type ShellQueryRunStatus =
  (typeof shellQueryRuns.$inferInsert)['status'];

export interface CreateShellQueryRunParams {
  id: string;
  tenantId: string;
  userId: string;
  mid: string;
  snippetName?: string;
  targetDeCustomerKey?: string;
  targetUpdateType?: string;
  sqlTextHash: string;
  sqlTextEncrypted?: string;
  savedQueryId?: string;
  status: ShellQueryRunStatus;
}

export interface ListRunsParams {
  tenantId: string;
  mid: string;
  userId: string;
  page: number;
  pageSize: number;
  sortBy: 'createdAt' | 'durationMs' | 'rowCount' | 'status';
  sortDir: 'asc' | 'desc';
  status?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  queryId?: string;
  search?: string;
}

export interface ListRunsResult {
  runs: ShellQueryRun[];
  total: number;
}

export interface ShellQueryRunRepository {
  createRun(params: CreateShellQueryRunParams): Promise<void>;
  findRun(
    runId: string,
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<ShellQueryRun | null>;
  markCanceled(
    runId: string,
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<void>;
  countActiveRuns(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<number>;
  countMonthlyRuns(
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<number>;
  listRuns(params: ListRunsParams): Promise<ListRunsResult>;
}
