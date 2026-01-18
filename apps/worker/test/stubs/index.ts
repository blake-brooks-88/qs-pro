import { vi } from 'vitest';

// Database stub that properly chains methods
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

// MCE Bridge stub
export function createMceBridgeStub() {
  return {
    soapRequest: vi.fn(),
    request: vi.fn(),
  };
}

// Redis stub
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

// Metrics stub
export function createMetricsStub() {
  return {
    inc: vi.fn(),
    dec: vi.fn(),
    observe: vi.fn(),
  };
}

// RLS Context stub
export function createRlsContextStub() {
  return {
    runWithTenantContext: vi.fn().mockImplementation(async (_t, _m, cb) => cb()),
    runWithUserContext: vi.fn().mockImplementation(async (_t, _m, _u, cb) => cb()),
  };
}

// BullMQ Queue stub
export function createQueueStub() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'poll-job-1' }),
    getJob: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}

// QueryDefinitionService stub
export function createQueryDefinitionServiceStub() {
  return {
    deleteByCustomerKey: vi.fn().mockResolvedValue(true),
  };
}
