/**
 * MCE (Marketing Cloud Engagement) service stubs
 * Consolidated from: apps/api/test/stubs/index.ts + apps/worker/test/stubs/index.ts
 */

import { vi } from "vitest";

import { withOverrides } from "./with-overrides";

/** MCE Bridge stub interface */
export interface MceBridgeStub {
  request: ReturnType<typeof vi.fn>;
  soapRequest: ReturnType<typeof vi.fn>;
}

/** REST Data Service stub interface */
export interface RestDataServiceStub {
  getRowset: ReturnType<typeof vi.fn>;
  checkIsRunning: ReturnType<typeof vi.fn>;
}

/** Async Status Service stub interface */
export interface AsyncStatusServiceStub {
  retrieve: ReturnType<typeof vi.fn>;
}

/** Data Folder Service stub interface */
export interface DataFolderServiceStub {
  retrieve: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

/** Data Extension Service stub interface */
export interface DataExtensionServiceStub {
  retrieve: ReturnType<typeof vi.fn>;
  retrieveByName: ReturnType<typeof vi.fn>;
  retrieveByCustomerKey: ReturnType<typeof vi.fn>;
  retrieveFields: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
}

/** Query Definition Service stub interface */
export interface QueryDefinitionServiceStub {
  retrieve: ReturnType<typeof vi.fn>;
  retrieveByFolder: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  perform: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

/**
 * Create a stub for MceBridgeService (API gateway to MCE)
 * Source: apps/api/test/stubs + apps/worker/test/stubs
 */
export function createMceBridgeStub(
  overrides?: Partial<MceBridgeStub>,
): MceBridgeStub {
  return withOverrides(
    {
      request: vi.fn().mockResolvedValue({ items: [] }),
      soapRequest: vi.fn(),
    },
    overrides,
  );
}

/**
 * Create a stub for RestDataService (MCE REST API operations)
 * Source: apps/api/test/stubs + apps/worker/test/stubs
 */
export function createRestDataServiceStub(
  overrides?: Partial<RestDataServiceStub>,
): RestDataServiceStub {
  return withOverrides(
    {
      getRowset: vi.fn().mockResolvedValue({
        pageSize: 50,
        page: 1,
        count: 0,
        items: [],
      }),
      checkIsRunning: vi.fn().mockResolvedValue({ isRunning: false }),
    },
    overrides,
  );
}

/**
 * Create a stub for AsyncStatusService (SOAP AsyncActivityStatus queries)
 * Source: apps/worker/test/stubs
 */
export function createAsyncStatusServiceStub(
  overrides?: Partial<AsyncStatusServiceStub>,
): AsyncStatusServiceStub {
  return withOverrides(
    {
      retrieve: vi.fn().mockResolvedValue({
        status: "Pending",
        errorMsg: null,
        completedDate: null,
      }),
    },
    overrides,
  );
}

/**
 * Create a stub for DataFolderService (SOAP DataFolder operations)
 * Source: apps/worker/test/stubs
 */
export function createDataFolderServiceStub(
  overrides?: Partial<DataFolderServiceStub>,
): DataFolderServiceStub {
  return withOverrides(
    {
      retrieve: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 1 }),
    },
    overrides,
  );
}

/**
 * Create a stub for DataExtensionService (SOAP DataExtension operations)
 * Source: apps/worker/test/stubs
 */
export function createDataExtensionServiceStub(
  overrides?: Partial<DataExtensionServiceStub>,
): DataExtensionServiceStub {
  return withOverrides(
    {
      retrieve: vi.fn().mockResolvedValue(null),
      retrieveByName: vi.fn().mockResolvedValue(null),
      retrieveByCustomerKey: vi.fn().mockResolvedValue(null),
      retrieveFields: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ objectId: "de-obj-1" }),
    },
    overrides,
  );
}

/**
 * Create a stub for QueryDefinitionService (SOAP QueryDefinition operations)
 * Source: apps/worker/test/stubs
 */
export function createQueryDefinitionServiceStub(
  overrides?: Partial<QueryDefinitionServiceStub>,
): QueryDefinitionServiceStub {
  return withOverrides(
    {
      retrieve: vi.fn().mockResolvedValue(null),
      retrieveByFolder: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ objectId: "obj-1" }),
      perform: vi.fn().mockResolvedValue({ taskId: "task-1" }),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    overrides,
  );
}
