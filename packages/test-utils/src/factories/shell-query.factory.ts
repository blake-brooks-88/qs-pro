/**
 * Shell query job factories for BullMQ workers
 * Consolidated from: apps/worker/test/factories/index.ts
 */

import { getNextShellQueryId } from "../setup/reset";

/** Shell query job data for BullMQ execute-shell-query queue */
export interface ShellQueryJob {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  sqlText: string;
  snippetName?: string;
  tableMetadata?: {
    name: string;
    columns: Array<{
      name: string;
      type: string;
      maxLength?: number;
      isPrimaryKey?: boolean;
      isNullable?: boolean;
    }>;
  };
}

/** Poll shell query job data for checking query completion status */
export interface PollShellQueryJob {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  taskId: string;
  queryDefinitionId: string;
  queryCustomerKey: string;
  targetDeCustomerKey: string;
  pollCount: number;
  pollStartedAt: string;
  notRunningDetectedAt?: string;
  notRunningConfirmations?: number;
  rowsetReadyDetectedAt?: string;
  rowsetReadyAttempts?: number;
  rowProbeAttempts?: number;
  rowProbeLastCheckedAt?: string;
}

/** Default plaintext SQL for reference in tests */
export const DEFAULT_SQL_TEXT = "SELECT SubscriberKey FROM _Subscribers";

/** Encrypted using stub's 'encrypted:' prefix pattern (matches createEncryptionServiceStub) */
export const DEFAULT_ENCRYPTED_SQL_TEXT = `encrypted:${DEFAULT_SQL_TEXT}`;

/**
 * Create a mock shell query job for BullMQ execute-shell-query queue
 * @param overrides - Optional fields to override defaults
 */
export function createMockJob(
  overrides: Partial<ShellQueryJob> = {},
): ShellQueryJob {
  const id = getNextShellQueryId();
  return {
    runId: `run-test-${id}`,
    tenantId: "tenant-1",
    userId: "user-1",
    mid: "mid-1",
    eid: "eid-1",
    sqlText: DEFAULT_ENCRYPTED_SQL_TEXT,
    snippetName: "Test Query",
    ...overrides,
  };
}

/**
 * Create a mock poll job data for checking query completion
 * @param overrides - Optional fields to override defaults
 */
export function createMockPollJobData(
  overrides: Partial<PollShellQueryJob> = {},
): PollShellQueryJob {
  const id = getNextShellQueryId();
  return {
    runId: `run-test-${id}`,
    tenantId: "tenant-1",
    userId: "user-1",
    mid: "mid-1",
    taskId: `task-${id}`,
    queryDefinitionId: `query-def-${id}`,
    queryCustomerKey: `QPP_Query_run-test-${id}`,
    targetDeCustomerKey: "QPP_Results_run-",
    pollCount: 0,
    pollStartedAt: new Date().toISOString(),
    notRunningConfirmations: 0,
    ...overrides,
  };
}
