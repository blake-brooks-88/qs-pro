import { type ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthGuard } from "./auth.guard.js";

const mockGetSession = vi.fn();

vi.mock("./auth.js", () => ({
  getAuth: () => ({
    api: {
      getSession: mockGetSession,
    },
  }),
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: vi.fn((headers: unknown) => headers),
}));

import { fromNodeHeaders } from "better-auth/node";

describe("AuthGuard", () => {
  let guard: AuthGuard;
  let reflector: Reflector;

  const createMockContext = (
    request?: Record<string, unknown>,
  ): { context: ExecutionContext; request: Record<string, unknown> } => {
    const mockRequest: Record<string, unknown> = {
      headers: { authorization: "Bearer test-token" },
      ...request,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return { context, request: mockRequest };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    guard = new AuthGuard(reflector);
  });

  it("should allow access when @Public() decorator is present", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(true);

    const { context } = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockGetSession).not.toHaveBeenCalled();
  });

  it("should throw UnauthorizedException when no session exists", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    mockGetSession.mockResolvedValue(null);

    const { context } = createMockContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("should allow access and attach user to request when session exists", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);

    const mockSession = {
      user: { id: "user-1", role: "admin", email: "admin@test.com" },
      session: { id: "sess-1", token: "tok-1" },
    };
    mockGetSession.mockResolvedValue(mockSession);

    const { context, request } = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request["backofficeUser"]).toEqual(mockSession.user);
  });

  it("should attach session to request when session exists", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);

    const mockSession = {
      user: { id: "user-1", role: "admin", email: "admin@test.com" },
      session: { id: "sess-1", token: "tok-1" },
    };
    mockGetSession.mockResolvedValue(mockSession);

    const { context, request } = createMockContext();
    await guard.canActivate(context);

    expect(request["backofficeSession"]).toEqual(mockSession.session);
  });

  it("should call getSession with request headers", async () => {
    vi.spyOn(reflector, "getAllAndOverride").mockReturnValue(false);
    mockGetSession.mockResolvedValue(null);

    const headers = { authorization: "Bearer xyz", cookie: "sid=abc" };
    const { context } = createMockContext({ headers });
    await guard.canActivate(context).catch(() => {});

    expect(fromNodeHeaders).toHaveBeenCalledWith(headers);
  });
});
