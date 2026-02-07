/**
 * SOAP response types for MCE API calls
 */

import type { ShellQueryRunStatus } from "@qpp/database";
import type { TableMetadata } from "@qpp/shared-types";

/** Generic retrieve response result structure */
interface RetrieveResult {
  ID?: string;
  Status?: string;
  ErrorMsg?: string;
  CustomerKey?: string;
  Name?: string;
  ObjectID?: string;
  [key: string]: unknown;
}

/** Response for retrieve operations that return single or multiple results */
export interface SoapRetrieveResponse {
  Body?: {
    RetrieveResponseMsg?: {
      Results?: RetrieveResult | RetrieveResult[];
    };
  };
}

/** Property in AsyncActivityStatus response */
interface AsyncStatusProperty {
  Name: string;
  Value: string;
}

/** Result structure for AsyncActivityStatus queries */
interface AsyncStatusResult {
  PartnerKey?: string;
  ObjectID?: string;
  Type?: string;
  Properties?: {
    Property?: AsyncStatusProperty[];
  };
  // Legacy direct properties (fallback)
  Status?: string;
  ErrorMsg?: string;
}

/** Response for AsyncActivityStatus queries (always single result) */
export interface SoapAsyncStatusResponse {
  Body?: {
    RetrieveResponseMsg?: {
      OverallStatus?: string;
      RequestID?: string;
      Results?: AsyncStatusResult;
    };
  };
}

export interface SoapCreateResponse {
  Body?: {
    CreateResponse?: {
      Results?: {
        StatusCode?: string;
        StatusMessage?: string;
        NewID?: string;
        NewObjectID?: string;
        ErrorCode?: string;
        [key: string]: unknown;
      };
    };
  };
}

export interface SoapPerformResponse {
  Body?: {
    PerformResponseMsg?: {
      Results?: {
        Result?: {
          StatusCode?: string;
          StatusMessage?: string;
          TaskID?: string;
          Task?: {
            StatusCode?: string;
            StatusMessage?: string;
            ID?: string;
            InteractionObjectID?: string;
          };
          [key: string]: unknown;
        };
      };
    };
  };
}

export interface ShellQueryJob {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  sqlText: string;
  snippetName?: string;
  tableMetadata?: TableMetadata;
  targetDeCustomerKey?: string;
  targetUpdateType?: "Overwrite" | "Append" | "Update";
}

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

export interface FlowResult {
  status: "ready" | "failed" | "canceled";
  taskId?: string;
  queryDefinitionId?: string;
  queryCustomerKey?: string;
  targetDeCustomerKey?: string;
  errorMessage?: string;
}

export type RunStatus =
  | ShellQueryRunStatus
  | "validating_query"
  | "creating_data_extension"
  | "targeting_data_extension"
  | "executing_query"
  | "fetching_results";

export const STATUS_MESSAGES = {
  queued: "Queued...",
  running: "Running...",
  validating_query: "Validating query...",
  creating_data_extension: "Creating temp Data Extension...",
  targeting_data_extension: "Targeting Data Extension...",
  executing_query: "Executing query...",
  fetching_results: "Fetching results...",
  ready: "Query completed",
  failed: "Query failed",
  canceled: "Query canceled",
} as const satisfies Record<RunStatus, string>;

export interface SSEEvent {
  status: RunStatus;
  message: string;
  errorMessage?: string;
  timestamp: string;
  runId: string;
}

export type StatusPublisher = (status: RunStatus) => Promise<void>;

export interface IFlowStrategy {
  execute(
    job: ShellQueryJob,
    publishStatus?: StatusPublisher,
  ): Promise<FlowResult>;
}

export const POLL_CONFIG = {
  INITIAL_DELAY_MS: 30000,
  MAX_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,
  JITTER_RANGE: 0.4,

  MAX_POLL_COUNT: 120,
  MAX_DURATION_MS: 29 * 60 * 1000,

  /**
   * Start REST isRunning verification early when CompletedDate is present in SOAP,
   * but avoid triggering immediately at the very start of execution (CompletedDate
   * can appear anomalously early in some responses).
   */
  COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS: 5000,

  STUCK_THRESHOLD_MS: 3 * 60 * 1000,

  NOT_RUNNING_CONFIRMATIONS: 2,
  NOT_RUNNING_CONFIRMATION_MIN_GAP_MS: 15000,

  ROWSET_READY_MAX_ATTEMPTS: 6,
  ROWSET_READY_INITIAL_DELAY_MS: 1500,
  ROWSET_READY_MAX_DELAY_MS: 8000,

  ROW_PROBE_MIN_RUNTIME_MS: 5000,
  ROW_PROBE_MIN_INTERVAL_MS: 15000,
  ROW_PROBE_PAGE_SIZE: 1,
} as const;

export function calculateNextDelay(pollCount: number): number {
  const baseDelay = Math.min(
    POLL_CONFIG.INITIAL_DELAY_MS *
      Math.pow(POLL_CONFIG.BACKOFF_MULTIPLIER, pollCount),
    POLL_CONFIG.MAX_DELAY_MS,
  );

  const jitter =
    1 - POLL_CONFIG.JITTER_RANGE / 2 + Math.random() * POLL_CONFIG.JITTER_RANGE;
  return Math.floor(baseDelay * jitter);
}

export function calculateRowsetReadyDelay(attempt: number): number {
  const baseDelay = Math.min(
    POLL_CONFIG.ROWSET_READY_INITIAL_DELAY_MS * Math.pow(2, attempt),
    POLL_CONFIG.ROWSET_READY_MAX_DELAY_MS,
  );

  const jitter = 1 - 0.2 + Math.random() * 0.4;
  return Math.floor(baseDelay * jitter);
}
