import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
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

function createMockDb(deletedAt: Date | null = null) {
  const limitFn = vi.fn().mockResolvedValue([{ deletedAt }]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  const selectFn = vi.fn().mockReturnValue({ from: fromFn });
  return { select: selectFn } as never;
}

describe("SessionGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws 401 when no session exists on request", async () => {
    const guard = new SessionGuard(createMockDb());

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects non-string session values", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: 123,
      tenantId: "tenant-1",
      mid: "mid-1",
    });

    await expect(guard.canActivate(createContext({ session }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects empty session values", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "",
      tenantId: "tenant-1",
      mid: "mid-1",
    });

    await expect(guard.canActivate(createContext({ session }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("decorates request.user with { userId, tenantId, mid } and resets idle timer", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now(),
    });
    const request: { session: TestSession; user?: unknown } = { session };

    const allowed = await guard.canActivate(createContext(request));

    expect(allowed).toBe(true);
    expect(request.user).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
    });
    expect(session.touch).toHaveBeenCalledOnce();
  });

  it("calls session.touch() on successful authentication", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now(),
    });

    await guard.canActivate(createContext({ session }));

    expect(session.touch).toHaveBeenCalledOnce();
  });

  it("rejects session exceeding absolute timeout", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS - 1,
    });
    const request: { session: TestSession; sessionExpiredContext?: unknown } = {
      session,
    };

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
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

  it("accepts session within absolute timeout", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS + 60_000,
    });

    const allowed = await guard.canActivate(createContext({ session }));

    expect(allowed).toBe(true);
    expect(session.delete).not.toHaveBeenCalled();
  });

  it("backfills createdAt on legacy sessions missing it", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
    });

    const before = Date.now();
    const allowed = await guard.canActivate(createContext({ session }));
    const after = Date.now();

    expect(allowed).toBe(true);
    expect(session.set).toHaveBeenCalledOnce();
    const call = session.set.mock.calls[0] as [string, number];
    expect(call[0]).toBe("createdAt");
    expect(call[1]).toBeGreaterThanOrEqual(before);
    expect(call[1]).toBeLessThanOrEqual(after);
    expect(session.touch).toHaveBeenCalledOnce();
  });

  it("does not call touch() when session is expired", async () => {
    const guard = new SessionGuard(createMockDb());
    const session = createSession({
      userId: "user-1",
      tenantId: "tenant-1",
      mid: "mid-1",
      createdAt: Date.now() - ABSOLUTE_TIMEOUT_MS - 1,
    });

    await expect(
      guard.canActivate(createContext({ session })),
    ).rejects.toThrow();
    expect(session.touch).not.toHaveBeenCalled();
  });

  describe("soft-deleted tenant blocking", () => {
    it("allows active tenant", async () => {
      const db = createMockDb(null);
      const guard = new SessionGuard(db);
      const session = createSession({
        userId: "user-1",
        tenantId: "tenant-1",
        mid: "mid-1",
        createdAt: Date.now(),
      });

      const allowed = await guard.canActivate(createContext({ session }));

      expect(allowed).toBe(true);
      expect(session.touch).toHaveBeenCalledOnce();
      expect(session.delete).not.toHaveBeenCalled();
    });

    it("blocks soft-deleted tenant with 403 and destroys session", async () => {
      const db = createMockDb(new Date("2025-01-01"));
      const guard = new SessionGuard(db);
      const session = createSession({
        userId: "user-1",
        tenantId: "tenant-1",
        mid: "mid-1",
        createdAt: Date.now(),
      });

      await expect(
        guard.canActivate(createContext({ session })),
      ).rejects.toThrow(ForbiddenException);
      expect(session.delete).toHaveBeenCalledOnce();
      expect(session.touch).not.toHaveBeenCalled();
    });
  });
});
