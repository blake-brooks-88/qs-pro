import { UnauthorizedException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SessionGuard } from "./session.guard";
import { ABSOLUTE_TIMEOUT_MS } from "./session-timeout.constants";

type TestSession = {
  get: (key: string) => unknown;
  set: ReturnType<typeof vi.fn>;
  touch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createSession(data: Record<string, unknown>): TestSession {
  return {
    get: (key: string) => data[key],
    set: vi.fn(),
    touch: vi.fn(),
    delete: vi.fn(),
  };
}

function createContext(request: {
  session?: TestSession;
  [key: string]: unknown;
}) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as never;
}

describe("SessionGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws 401 when no session exists on request", () => {
    const guard = new SessionGuard();

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects non-string session values", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: 123,
      tenantId: "tenant-1",
      mid: "mid-1",
    });

    expect(() => guard.canActivate(createContext({ session }))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects empty session values", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "",
      tenantId: "tenant-1",
      mid: "mid-1",
    });

    expect(() => guard.canActivate(createContext({ session }))).toThrow(
      UnauthorizedException,
    );
  });

  it("decorates request.user with { userId, tenantId, mid } and resets idle timer", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now(),
    });
    const request: { session: TestSession; user?: unknown } = { session };

    const allowed = guard.canActivate(createContext(request));

    expect(allowed).toBe(true);
    expect(request.user).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
    });
    expect(session.touch).toHaveBeenCalledOnce();
  });

  it("calls session.touch() on successful authentication", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now(),
    });

    guard.canActivate(createContext({ session }));

    expect(session.touch).toHaveBeenCalledOnce();
  });

  it("rejects session exceeding absolute timeout", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS - 1,
    });
    const request: { session: TestSession; sessionExpiredContext?: unknown } = {
      session,
    };

    expect(() => guard.canActivate(createContext(request))).toThrow(
      new UnauthorizedException("Session expired"),
    );
    expect(session.delete).toHaveBeenCalledOnce();
    expect(request.sessionExpiredContext).toEqual({
      reason: "absolute_timeout",
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
    });
  });

  it("accepts session within absolute timeout", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS + 60_000,
    });

    const allowed = guard.canActivate(createContext({ session }));

    expect(allowed).toBe(true);
    expect(session.delete).not.toHaveBeenCalled();
  });

  it("backfills createdAt on legacy sessions missing it", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
    });

    const before = Date.now();
    const allowed = guard.canActivate(createContext({ session }));
    const after = Date.now();

    expect(allowed).toBe(true);
    expect(session.set).toHaveBeenCalledOnce();
    const [key, value] = session.set.mock.calls[0];
    expect(key).toBe("createdAt");
    expect(value).toBeGreaterThanOrEqual(before);
    expect(value).toBeLessThanOrEqual(after);
    expect(session.touch).toHaveBeenCalledOnce();
  });

  it("does not call touch() when session is expired", () => {
    const guard = new SessionGuard();
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS - 1,
    });

    expect(() => guard.canActivate(createContext({ session }))).toThrow();
    expect(session.touch).not.toHaveBeenCalled();
  });
});
