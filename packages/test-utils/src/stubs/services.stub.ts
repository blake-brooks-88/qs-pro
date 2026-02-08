/**
 * Application service stubs
 * Consolidated from: apps/api/test/stubs/index.ts + apps/worker/test/stubs/index.ts
 */

import { vi } from "vitest";

import { withOverrides } from "./with-overrides";

/** RLS Context stub interface */
export interface RlsContextStub {
  runWithTenantContext: ReturnType<typeof vi.fn>;
  runWithUserContext: ReturnType<typeof vi.fn>;
}

/** BullMQ Queue stub interface */
export interface QueueStub {
  add: ReturnType<typeof vi.fn>;
  getJob: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

/** Shell Query Service stub interface */
export interface ShellQueryServiceStub {
  createRun: ReturnType<typeof vi.fn>;
  getRun: ReturnType<typeof vi.fn>;
  getRunStatus: ReturnType<typeof vi.fn>;
  getResults: ReturnType<typeof vi.fn>;
  cancelRun: ReturnType<typeof vi.fn>;
  listHistory: ReturnType<typeof vi.fn>;
  getRunSqlText: ReturnType<typeof vi.fn>;
}

/** Shell Query Run Repository stub interface */
export interface ShellQueryRunRepoStub {
  createRun: ReturnType<typeof vi.fn>;
  findRun: ReturnType<typeof vi.fn>;
  markCanceled: ReturnType<typeof vi.fn>;
  countActiveRuns: ReturnType<typeof vi.fn>;
  listRuns: ReturnType<typeof vi.fn>;
}

/** Shell Query SSE Service stub interface */
export interface ShellQuerySseServiceStub {
  streamRunEvents: ReturnType<typeof vi.fn>;
}

/** Encryption Service stub interface */
export interface EncryptionServiceStub {
  encrypt: ReturnType<typeof vi.fn>;
  decrypt: ReturnType<typeof vi.fn>;
}

/** Metrics stub interface */
export interface MetricsStub {
  inc: ReturnType<typeof vi.fn>;
  dec: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}

/** Tenant Repository stub interface */
export interface TenantRepoStub {
  findById: ReturnType<typeof vi.fn>;
}

/**
 * Create a stub for RlsContextService (Row-Level Security context)
 * Merged from: apps/api/test/stubs + apps/worker/test/stubs
 * Worker version includes runWithUserContext
 */
export function createRlsContextStub(
  overrides?: Partial<RlsContextStub>,
): RlsContextStub {
  return withOverrides(
    {
      runWithTenantContext: vi
        .fn()
        .mockImplementation(
          async <T>(
            _tenantId: string,
            _mid: string,
            callback: () => T | Promise<T>,
          ): Promise<T> => callback(),
        ),
      runWithUserContext: vi
        .fn()
        .mockImplementation(
          async <T>(
            _tenantId: string,
            _mid: string,
            _userId: string,
            callback: () => T | Promise<T>,
          ): Promise<T> => callback(),
        ),
    },
    overrides,
  );
}

/**
 * Create a stub for BullMQ Queue
 * Merged from: apps/api/test/stubs + apps/worker/test/stubs
 */
export function createQueueStub(overrides?: Partial<QueueStub>): QueueStub {
  return withOverrides(
    {
      add: vi.fn().mockResolvedValue({ id: "job-1" }),
      getJob: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(undefined),
    },
    overrides,
  );
}

/**
 * Create a stub for ShellQueryService
 * Source: apps/api/test/stubs
 */
export function createShellQueryServiceStub(
  overrides?: Partial<ShellQueryServiceStub>,
): ShellQueryServiceStub {
  return withOverrides(
    {
      createRun: vi.fn().mockResolvedValue("run-123"),
      getRun: vi.fn(),
      getRunStatus: vi.fn(),
      getResults: vi.fn().mockResolvedValue({ items: [] }),
      cancelRun: vi.fn().mockResolvedValue({ status: "canceled" }),
      listHistory: vi
        .fn()
        .mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 }),
      getRunSqlText: vi.fn().mockResolvedValue(null),
    },
    overrides,
  );
}

/**
 * Create a stub for ShellQueryRunRepository
 * Source: apps/api/test/stubs
 */
export function createShellQueryRunRepoStub(
  overrides?: Partial<ShellQueryRunRepoStub>,
): ShellQueryRunRepoStub {
  return withOverrides(
    {
      createRun: vi.fn().mockResolvedValue(undefined),
      findRun: vi.fn().mockResolvedValue(null),
      markCanceled: vi.fn().mockResolvedValue(undefined),
      countActiveRuns: vi.fn().mockResolvedValue(0),
      listRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
    },
    overrides,
  );
}

/**
 * Create a stub for ShellQuerySseService
 * Source: apps/api/test/stubs
 * Note: Returns EMPTY observable by default (import { EMPTY } from 'rxjs' in tests)
 */
export function createShellQuerySseServiceStub(
  overrides?: Partial<ShellQuerySseServiceStub>,
): ShellQuerySseServiceStub {
  return withOverrides(
    {
      streamRunEvents: vi.fn().mockReturnValue({ subscribe: vi.fn() }),
    },
    overrides,
  );
}

/**
 * Create a stub for EncryptionService
 * Source: apps/worker/test/stubs
 * Uses 'encrypted:' prefix pattern for easy test verification
 */
export function createEncryptionServiceStub(
  overrides?: Partial<EncryptionServiceStub>,
): EncryptionServiceStub {
  return withOverrides(
    {
      encrypt: vi.fn((value: string | null | undefined) =>
        value ? `encrypted:${value}` : value,
      ),
      decrypt: vi.fn((value: string | null | undefined) =>
        value?.startsWith("encrypted:") ? value.slice(10) : value,
      ),
    },
    overrides,
  );
}

/**
 * Create a stub for metrics (Prometheus counters/histograms)
 * Source: apps/worker/test/stubs
 */
export function createMetricsStub(
  overrides?: Partial<MetricsStub>,
): MetricsStub {
  return withOverrides(
    {
      inc: vi.fn(),
      dec: vi.fn(),
      observe: vi.fn(),
    },
    overrides,
  );
}

/**
 * Create a stub for TenantRepository
 * Source: apps/api/test/stubs
 */
export function createTenantRepoStub(
  overrides?: Partial<TenantRepoStub>,
): TenantRepoStub {
  return withOverrides(
    {
      findById: vi.fn().mockResolvedValue({ eid: "eid-1" }),
    },
    overrides,
  );
}
