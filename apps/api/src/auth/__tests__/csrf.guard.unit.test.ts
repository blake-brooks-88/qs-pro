import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { CsrfGuard } from '../csrf.guard';

/**
 * Creates a mock ExecutionContext for testing the CSRF guard.
 *
 * @param options - Configuration options for the mock context
 * @param options.method - HTTP method (default: 'POST')
 * @param options.session - Session object with get method, or null for no session
 * @param options.headers - Request headers object
 */
function createMockContext(options: {
  method?: string;
  session?: { get: (key: string) => unknown } | null;
  headers?: Record<string, string | string[] | undefined>;
}): ExecutionContext {
  const { method = 'POST', session = null, headers = {} } = options;

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        session,
        headers,
      }),
    }),
  } as unknown as ExecutionContext;
}

/**
 * Creates a mock session with a CSRF token.
 *
 * @param csrfToken - The CSRF token to store in session (undefined to omit)
 */
function createMockSession(csrfToken?: string): {
  get: (key: string) => unknown;
} {
  return {
    get: (key: string) => (key === 'csrfToken' ? csrfToken : undefined),
  };
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  describe('safe HTTP methods bypass CSRF validation', () => {
    it('should allow GET requests without CSRF validation', () => {
      // Arrange
      const context = createMockContext({ method: 'GET' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow HEAD requests without CSRF validation', () => {
      // Arrange
      const context = createMockContext({ method: 'HEAD' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow OPTIONS requests without CSRF validation', () => {
      // Arrange
      const context = createMockContext({ method: 'OPTIONS' });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('session validation', () => {
    it('should throw UnauthorizedException when session is missing', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: null,
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('No session found');
    });

    it('should throw UnauthorizedException when session has no csrfToken', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession(undefined),
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Missing CSRF token');
    });
  });

  describe('CSRF header validation', () => {
    it('should throw UnauthorizedException when CSRF header is missing', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession('valid-csrf-token'),
        headers: {},
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Missing CSRF token');
    });
  });

  describe('CSRF token comparison', () => {
    it('should throw UnauthorizedException when CSRF token does not match', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession('expected-token'),
        headers: { 'x-csrf-token': 'wrong-token!!' },
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid CSRF token');
    });

    it('should throw UnauthorizedException when token lengths differ', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession('short'),
        headers: { 'x-csrf-token': 'much-longer-token-value' },
      });

      // Act & Assert
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid CSRF token');
    });
  });

  describe('valid CSRF token acceptance', () => {
    const validToken = 'valid-csrf-token-12345';

    it('should return true when x-csrf-token header matches session token', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession(validToken),
        headers: { 'x-csrf-token': validToken },
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when x-xsrf-token header matches session token', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession(validToken),
        headers: { 'x-xsrf-token': validToken },
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should return true when x-csrftoken header matches session token', () => {
      // Arrange
      const context = createMockContext({
        method: 'POST',
        session: createMockSession(validToken),
        headers: { 'x-csrftoken': validToken },
      });

      // Act
      const result = guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });
});
