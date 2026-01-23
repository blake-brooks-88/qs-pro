/**
 * Database stub for Drizzle ORM operations
 * Consolidated from: apps/api/test/stubs/index.ts + apps/worker/test/stubs/index.ts
 *
 * This merged version combines features from both apps:
 * - Worker version: .limit() chain support, setSelectResult, setUpdateResult, onConflictDoUpdate
 * - API version: _whereResult pattern
 */

import { vi } from "vitest";

/** Database stub interface for test assertions */
export interface DbStub {
  _selectResult: unknown[];
  _updateResult: unknown[];
  select: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  setSelectResult: (result: unknown[]) => void;
  setUpdateResult: (result: unknown[]) => void;
  setWhereResult: (result: unknown[]) => void;
}

/**
 * Create a database stub for Drizzle ORM operations
 * Supports chainable query methods and configurable results
 */
export function createDbStub(): DbStub {
  // Initialize with partial data, will be completed below
  const stub = {
    _selectResult: [] as unknown[],
    _updateResult: [] as unknown[],
  } as DbStub;

  // Support both .where() returning result directly and .where().limit() chain
  const whereResult = () => {
    const result = stub._selectResult as unknown[];
    // Also support .limit() chain
    (result as unknown as { limit: ReturnType<typeof vi.fn> }).limit = vi
      .fn()
      .mockReturnValue(stub._selectResult);
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

  stub.where = vi.fn(whereResult);

  stub.setSelectResult = (result: unknown[]) => {
    stub._selectResult = result;
  };
  stub.setUpdateResult = (result: unknown[]) => {
    stub._updateResult = result;
  };
  // Alias for API compatibility
  stub.setWhereResult = (result: unknown[]) => {
    stub._selectResult = result;
    stub.where.mockReturnValue(result);
  };

  return stub;
}
