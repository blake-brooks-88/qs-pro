import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockContext = (
    user?: Record<string, unknown>,
  ): ExecutionContext => {
    const mockRequest: Record<string, unknown> = {};
    if (user) {
      mockRequest['backofficeUser'] = user;
    }
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
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles are required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({ role: 'viewer' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow admin access to admin-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = createMockContext({ role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow admin access to editor-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['editor']);

    const context = createMockContext({ role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow admin access to viewer-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['viewer']);

    const context = createMockContext({ role: 'admin' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow editor access to editor-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['editor']);

    const context = createMockContext({ role: 'editor' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow editor access to viewer-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['viewer']);

    const context = createMockContext({ role: 'editor' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny viewer access to editor-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['editor']);

    const context = createMockContext({ role: 'viewer' });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should deny viewer access to admin-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = createMockContext({ role: 'viewer' });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should deny editor access to admin-required endpoints', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);

    const context = createMockContext({ role: 'editor' });
    expect(guard.canActivate(context)).toBe(false);
  });

  it('should treat missing role as viewer', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['editor']);

    const context = createMockContext({});
    expect(guard.canActivate(context)).toBe(false);
  });
});
