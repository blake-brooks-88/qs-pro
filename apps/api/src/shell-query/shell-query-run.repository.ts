import type { shellQueryRuns } from '@qs-pro/database';

export type ShellQueryRun = typeof shellQueryRuns.$inferSelect;
export type ShellQueryRunStatus =
  (typeof shellQueryRuns.$inferInsert)['status'];

export interface CreateShellQueryRunParams {
  id: string;
  tenantId: string;
  userId: string;
  mid: string;
  snippetName?: string;
  sqlTextHash: string;
  status: ShellQueryRunStatus;
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
}
