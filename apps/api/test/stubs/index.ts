import { vi } from 'vitest';
import { ExecutionContext } from '@nestjs/common';
import { createMockUserSession } from '../factories';

// Database stub
export function createDbStub() {
  const stub: any = {
    _whereResult: [{ count: 0 }],
  };

  stub.select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => stub._whereResult),
    })),
  }));

  stub.update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
  }));

  stub.insert = vi.fn(() => ({
    values: vi.fn().mockResolvedValue(undefined),
  }));

  stub.where = vi.fn(() => stub._whereResult);

  stub.setWhereResult = (result: any[]) => {
    stub._whereResult = result;
    stub.where.mockReturnValue(result);
  };

  return stub;
}

// BullMQ Queue stub
export function createQueueStub() {
  return {
    add: vi.fn().mockResolvedValue({ id: 'job-1' }),
    getJob: vi.fn(),
  };
}

// Redis stub
export function createRedisStub() {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockReturnThis(),
    on: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
  };
}

// RLS Context stub
export function createRlsContextStub() {
  return {
    runWithTenantContext: vi.fn().mockImplementation((_t, _m, cb) => cb()),
  };
}

// Tenant repository stub
export function createTenantRepoStub() {
  return {
    findById: vi.fn().mockResolvedValue({ eid: 'eid-1' }),
  };
}

// MCE Bridge stub
export function createMceBridgeStub() {
  return {
    request: vi.fn().mockResolvedValue({ items: [] }),
    soapRequest: vi.fn(),
  };
}

// Shell Query Service stub
export function createShellQueryServiceStub() {
  return {
    createRun: vi.fn().mockResolvedValue('run-123'),
    getRun: vi.fn(),
    getResults: vi.fn().mockResolvedValue({ items: [] }),
    cancelRun: vi.fn().mockResolvedValue({ status: 'canceled' }),
  };
}

// Session guard mock factory
export function createSessionGuardMock(userSession = createMockUserSession()) {
  return {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.user = userSession;
      return true;
    },
  };
}
