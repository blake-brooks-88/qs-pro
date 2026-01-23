/**
 * User session and shell query context factories
 * Consolidated from: apps/api/test/factories/index.ts
 */

import { getNextUserSessionId } from "../setup/reset";

/** User session data for authenticated requests */
export interface MockUserSession {
  userId: string;
  tenantId: string;
  mid: string;
}

/** Shell query execution context */
export interface MockShellQueryContext {
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  accessToken: string;
}

/** Shell query run record */
export interface MockShellQueryRun {
  id: string;
  tenantId: string;
  userId: string;
  mid: string;
  snippetName: string;
  sqlTextHash: string;
  status: string;
  createdAt: Date;
}

/**
 * Create a mock user session with unique IDs
 * @param overrides - Optional fields to override defaults
 */
export function createMockUserSession(
  overrides: Partial<MockUserSession> = {},
): MockUserSession {
  const id = getNextUserSessionId();
  return {
    userId: `user-${id}`,
    tenantId: `tenant-${id}`,
    mid: `mid-${id}`,
    ...overrides,
  };
}

/**
 * Create a mock shell query context with unique IDs
 * @param overrides - Optional fields to override defaults
 */
export function createMockShellQueryContext(
  overrides: Partial<MockShellQueryContext> = {},
): MockShellQueryContext {
  const id = getNextUserSessionId();
  return {
    tenantId: `tenant-${id}`,
    userId: `user-${id}`,
    mid: `mid-${id}`,
    eid: `eid-${id}`,
    accessToken: `token-${id}`,
    ...overrides,
  };
}

/**
 * Create a mock shell query run record with unique IDs
 * @param overrides - Optional fields to override defaults
 */
export function createMockShellQueryRun(
  overrides: Partial<MockShellQueryRun> = {},
): MockShellQueryRun {
  const id = getNextUserSessionId();
  return {
    id: `run-${id}`,
    tenantId: `tenant-${id}`,
    userId: `user-${id}`,
    mid: `mid-${id}`,
    snippetName: "Test Query",
    sqlTextHash: `hash-${id}`,
    status: "queued",
    createdAt: new Date(),
    ...overrides,
  };
}
