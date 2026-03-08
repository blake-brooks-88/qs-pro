import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AuthGuard } from './auth.guard.js';

vi.mock('./auth.js', () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock('better-auth/node', () => ({
  fromNodeHeaders: vi.fn((headers: unknown) => headers),
}));

import { auth } from './auth.js';
import { fromNodeHeaders } from 'better-auth/node';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let reflector: Reflector;

  const createMockContext = (
    request: Record<string, unknown> = {},
  ): ExecutionContext => {
    const mockRequest = {
      headers: { authorization: 'Bearer test-token' },
      ...request,
    };
    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    reflector = new Reflector();
    guard = new AuthGuard(reflector);
  });

  it('should allow access when @Public() decorator is present', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('should deny access when no session exists', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const context = createMockContext();
    const result = await guard.canActivate(context);

    expect(result).toBe(false);
  });

  it('should allow access and attach user to request when session exists', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const mockSession = {
      user: { id: 'user-1', role: 'admin', email: 'admin@test.com' },
      session: { id: 'sess-1', token: 'tok-1' },
    };
    vi.mocked(auth.api.getSession).mockResolvedValue(
      mockSession as ReturnType<typeof auth.api.getSession> extends Promise<
        infer T
      >
        ? T
        : never,
    );

    const request: Record<string, unknown> = {};
    const context = createMockContext(request);
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request['backofficeUser']).toEqual(mockSession.user);
  });

  it('should attach session to request when session exists', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    const mockSession = {
      user: { id: 'user-1', role: 'admin', email: 'admin@test.com' },
      session: { id: 'sess-1', token: 'tok-1' },
    };
    vi.mocked(auth.api.getSession).mockResolvedValue(
      mockSession as ReturnType<typeof auth.api.getSession> extends Promise<
        infer T
      >
        ? T
        : never,
    );

    const request: Record<string, unknown> = {};
    const context = createMockContext(request);
    await guard.canActivate(context);

    expect(request['backofficeSession']).toEqual(mockSession.session);
  });

  it('should call getSession with request headers', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const headers = { authorization: 'Bearer xyz', cookie: 'sid=abc' };
    const context = createMockContext({ headers });
    await guard.canActivate(context);

    expect(fromNodeHeaders).toHaveBeenCalledWith(headers);
  });
});
