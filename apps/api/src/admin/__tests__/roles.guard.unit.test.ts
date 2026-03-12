import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { ROLES_KEY } from '../require-role.decorator';
import { RolesGuard } from '../roles.guard';

function createMockReflector(roles: string[] | undefined): Reflector {
  return {
    getAllAndOverride: vi.fn().mockReturnValue(roles),
  } as unknown as Reflector;
}

function createMockUserRepo(
  user?: {
    id: string;
    role: string;
  } | null,
) {
  return {
    findById: vi.fn().mockResolvedValue(user ?? undefined),
  };
}

function createMockContext(sessionUser?: {
  userId?: string;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: sessionUser,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('returns true when no roles metadata is set (public endpoint)', async () => {
    // Arrange
    const reflector = createMockReflector(undefined);
    const userRepo = createMockUserRepo();
    const guard = new RolesGuard(reflector, userRepo as never);
    const context = createMockContext({ userId: 'user-1' });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ROLES_KEY,
      expect.any(Array),
    );
  });

  it('returns true when user has required role (owner accessing owner endpoint)', async () => {
    // Arrange
    const reflector = createMockReflector(['owner']);
    const userRepo = createMockUserRepo({
      id: 'user-1',
      role: 'owner',
    });
    const guard = new RolesGuard(reflector, userRepo as never);
    const context = createMockContext({ userId: 'user-1' });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(userRepo.findById).toHaveBeenCalledWith('user-1');
  });

  it('returns true when user has one of multiple required roles', async () => {
    // Arrange
    const reflector = createMockReflector(['owner', 'admin']);
    const userRepo = createMockUserRepo({
      id: 'user-2',
      role: 'admin',
    });
    const guard = new RolesGuard(reflector, userRepo as never);
    const context = createMockContext({ userId: 'user-2' });

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when user role is insufficient', async () => {
    // Arrange
    const reflector = createMockReflector(['owner', 'admin']);
    const userRepo = createMockUserRepo({
      id: 'user-3',
      role: 'member',
    });
    const guard = new RolesGuard(reflector, userRepo as never);
    const context = createMockContext({ userId: 'user-3' });

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Insufficient permissions. Required role: owner or admin',
    );
  });

  it('throws ForbiddenException when user is not found in DB', async () => {
    // Arrange
    const reflector = createMockReflector(['admin']);
    const userRepo = createMockUserRepo(null);
    const guard = new RolesGuard(reflector, userRepo as never);
    const context = createMockContext({ userId: 'nonexistent' });

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Insufficient permissions',
    );
  });

  it('throws ForbiddenException when session user has no userId', async () => {
    // Arrange
    const reflector = createMockReflector(['admin']);
    const userRepo = createMockUserRepo();
    const guard = new RolesGuard(reflector, userRepo as never);
    const context = createMockContext({});

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
