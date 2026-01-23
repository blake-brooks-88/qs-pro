/**
 * NestJS-specific provider stubs (guards, interceptors, etc.)
 * Consolidated from: apps/api/test/stubs/index.ts
 */

import type { MockUserSession } from "../factories/user-session.factory";
import { createMockUserSession } from "../factories/user-session.factory";

/** NestJS ExecutionContext interface (minimal for testing) */
interface ExecutionContext {
  switchToHttp: () => {
    getRequest: () => {
      user?: MockUserSession;
      session?: {
        get: (key: string) => unknown;
        set: (key: string, value: unknown) => void;
        delete: () => void;
      };
    };
  };
}

/** Session Guard mock interface */
export interface SessionGuardMock {
  canActivate: (context: ExecutionContext) => boolean;
}

/**
 * Create a mock for SessionGuard that injects user session data
 * Source: apps/api/test/stubs
 *
 * @param userSession - Optional user session data (defaults to createMockUserSession())
 */
export function createSessionGuardMock(
  userSession: MockUserSession = createMockUserSession(),
): SessionGuardMock {
  const sessionData = new Map<string, unknown>([
    ["userId", userSession.userId],
    ["tenantId", userSession.tenantId],
    ["mid", userSession.mid],
    ["csrfToken", "csrf-test"],
  ]);

  return {
    canActivate: (context: ExecutionContext): boolean => {
      const req = context.switchToHttp().getRequest();
      req.user = userSession;
      req.session = {
        get: (key: string) => sessionData.get(key),
        set: (key: string, value: unknown) => {
          sessionData.set(key, value);
        },
        delete: () => {
          sessionData.clear();
        },
      };
      return true;
    },
  };
}
