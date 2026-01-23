/**
 * Redis (ioredis) stub for pub/sub and caching operations
 * Consolidated from: apps/api/test/stubs/index.ts + apps/worker/test/stubs/index.ts
 *
 * This merged version combines features from both apps:
 * - API version: duplicate() returning a new client mock
 * - Worker version: get/set operations
 */

import { vi } from "vitest";

/** Redis stub interface for test assertions */
export interface RedisStub {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  duplicate: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  incr: ReturnType<typeof vi.fn>;
  decr: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

/**
 * Create a Redis stub for pub/sub and caching operations
 * Includes duplicate() for SSE subscriptions and get/set for caching
 */
export function createRedisStub(): RedisStub {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    duplicate: vi.fn().mockReturnValue({
      subscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      off: vi.fn(),
    }),
    on: vi.fn(),
    off: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
    decr: vi.fn().mockResolvedValue(0),
    expire: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  };
}
