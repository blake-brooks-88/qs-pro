import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { createMockUserSession } from '@qpp/test-utils';
import { describe, expect, it } from 'vitest';

import { CurrentUser, UserSession } from '../current-user.decorator';

type DecoratorFactory = (data: unknown, ctx: ExecutionContext) => UserSession;

function getDecoratorFactory(): DecoratorFactory {
  class TestController {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    test(@CurrentUser() value: UserSession) {}
  }

  const metadata = Reflect.getMetadata(
    ROUTE_ARGS_METADATA,
    TestController,
    'test',
  ) as Record<string, { factory: DecoratorFactory }>;
  const key = Object.keys(metadata)[0] as string;
  return metadata[key].factory;
}

function createMockExecutionContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('CurrentUser decorator', () => {
  describe('when user is missing from request', () => {
    it('throws UnauthorizedException', () => {
      // Arrange
      const factory = getDecoratorFactory();
      const ctx = createMockExecutionContext(undefined);

      // Act & Assert
      expect(() => factory(undefined, ctx)).toThrow(UnauthorizedException);
      expect(() => factory(undefined, ctx)).toThrow('Not authenticated');
    });
  });

  describe('when user is missing required fields', () => {
    it('throws UnauthorizedException when userId is missing', () => {
      // Arrange
      const factory = getDecoratorFactory();
      const userWithoutUserId = {
        tenantId: 'tenant-123',
        mid: 'mid-123',
      };
      const ctx = createMockExecutionContext(userWithoutUserId);

      // Act & Assert
      expect(() => factory(undefined, ctx)).toThrow(UnauthorizedException);
      expect(() => factory(undefined, ctx)).toThrow('Not authenticated');
    });

    it('throws UnauthorizedException when tenantId is missing', () => {
      // Arrange
      const factory = getDecoratorFactory();
      const userWithoutTenantId = {
        userId: 'user-123',
        mid: 'mid-123',
      };
      const ctx = createMockExecutionContext(userWithoutTenantId);

      // Act & Assert
      expect(() => factory(undefined, ctx)).toThrow(UnauthorizedException);
      expect(() => factory(undefined, ctx)).toThrow('Not authenticated');
    });

    it('throws UnauthorizedException when mid is missing', () => {
      // Arrange
      const factory = getDecoratorFactory();
      const userWithoutMid = {
        userId: 'user-123',
        tenantId: 'tenant-123',
      };
      const ctx = createMockExecutionContext(userWithoutMid);

      // Act & Assert
      expect(() => factory(undefined, ctx)).toThrow(UnauthorizedException);
      expect(() => factory(undefined, ctx)).toThrow('Not authenticated');
    });
  });

  describe('when user has all required fields', () => {
    it('returns UserSession with userId, tenantId, and mid', () => {
      // Arrange
      const factory = getDecoratorFactory();
      const mockUser = createMockUserSession();
      const ctx = createMockExecutionContext(mockUser);

      // Act
      const result = factory(undefined, ctx);

      // Assert
      expect(result).toEqual({
        userId: mockUser.userId,
        tenantId: mockUser.tenantId,
        mid: mockUser.mid,
      });
    });
  });
});
