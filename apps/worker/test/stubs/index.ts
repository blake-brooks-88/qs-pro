import { vi } from 'vitest';

export function createDbStub() {
  const stub: any = {
    _selectResult: [],
    _updateResult: [],
  };

  // Support both .where() returning result directly and .where().limit() chain
  const whereResult = () => {
    const result = stub._selectResult;
    // Also support .limit() chain
    (result as any).limit = vi.fn(() => stub._selectResult);
    return result;
  };

  stub.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(whereResult),
    })),
  }));

  stub.update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue(stub._updateResult),
    })),
  }));

  stub.insert = vi.fn(() => ({
    values: vi.fn(() => ({
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    })),
  }));

  stub.setSelectResult = (result: any[]) => { stub._selectResult = result; };
  stub.setUpdateResult = (result: any[]) => { stub._updateResult = result; };

  return stub;
}

export function createMceBridgeStub() {
  return {
    soapRequest: vi.fn(),
    request: vi.fn(),
  };
}

export function createRedisStub() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockReturnThis(),
    on: vi.fn(),
    quit: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  };
}

export function createMetricsStub() {
  return {
    inc: vi.fn(),
    dec: vi.fn(),
    observe: vi.fn(),
  };
}

export function createRlsContextStub() {
  return {
    runWithTenantContext: vi.fn().mockImplementation(async (_t, _m, cb) => cb()),
    runWithUserContext: vi.fn().mockImplementation(async (_t, _m, _u, cb) => cb()),
  };
}

export function createQueueStub() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'poll-job-1' }),
    getJob: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

export function createAsyncStatusServiceStub() {
  return {
    retrieve: vi.fn().mockResolvedValue({
      status: 'Pending',
      errorMsg: null,
      completedDate: null,
    }),
  };
}

export function createDataFolderServiceStub() {
  return {
    retrieve: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: 1 }),
  };
}

export function createDataExtensionServiceStub() {
  return {
    retrieve: vi.fn().mockResolvedValue(null),
    retrieveFields: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ objectId: 'de-obj-1' }),
  };
}

export function createQueryDefinitionServiceStub() {
  return {
    retrieve: vi.fn().mockResolvedValue(null),
    retrieveByFolder: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ objectId: 'obj-1' }),
    perform: vi.fn().mockResolvedValue({ taskId: 'task-1' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

export function createRestDataServiceStub() {
  return {
    getRowset: vi.fn().mockResolvedValue({
      pageSize: 50,
      page: 1,
      count: 0,
      items: [],
    }),
    checkIsRunning: vi.fn().mockResolvedValue({ isRunning: false }),
  };
}
