import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, SessionGuard } from '@qpp/backend-shared';
import { createSessionGuardMock, resetFactories } from '@qpp/test-utils';
import type { FastifyReply } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../../audit/audit.service';
import { AuthController } from '../auth.controller';

type MockFn = ReturnType<typeof vi.fn>;

type MockSecureSession = {
  get: MockFn;
  set: MockFn;
  delete: MockFn;
  regenerate: MockFn;
};

interface OAuthStatePayload {
  tssd: string;
  nonce: string;
}

function createMockSession(
  initialData: Record<string, unknown> = {},
): MockSecureSession {
  const data = new Map<string, unknown>(Object.entries(initialData));
  return {
    get: vi.fn((key: string) => data.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      if (value === undefined) {
        data.delete(key);
      } else {
        data.set(key, value);
      }
    }),
    delete: vi.fn(() => data.clear()),
    regenerate: vi.fn(() => data.clear()),
  };
}

function createMockRequest(options: {
  headers?: Record<string, string | undefined>;
  body?: unknown;
  session?: MockSecureSession | undefined;
  ip?: string;
}) {
  return {
    headers: options.headers ?? {},
    body: options.body,
    session: options.session,
    ip: options.ip ?? '127.0.0.1',
  } as never;
}

function createMockResponse(): FastifyReply {
  const mock = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  return mock as unknown as FastifyReply;
}

function createMockAuthService() {
  return {
    handleJwtLogin: vi.fn(),
    findUserById: vi.fn(),
    findTenantById: vi.fn(),
    refreshToken: vi.fn(),
    getAuthUrl: vi.fn(),
    handleCallback: vi.fn(),
  };
}

function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

const MOCK_USER = { id: 'user-1', sfUserId: 'sf-user-1' };
const MOCK_TENANT = { id: 'tenant-1', eid: 'eid-1', tssd: 'test-tssd' };
const MOCK_MID = 'mid-1';
const FIXED_NOW = 1700000000000;

describe('AuthController session lifecycle', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof createMockAuthService>;

  beforeEach(async () => {
    resetFactories();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    authService = createMockAuthService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(createSessionGuardMock())
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('session lifecycle on loginPost()', () => {
    it('calls session.regenerate() before setting session values', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
        mid: MOCK_MID,
      });

      const session = createMockSession();
      const request = createMockRequest({
        headers: { accept: 'text/html' },
        session,
      });
      const response = createMockResponse();

      // Act
      await controller.loginPost({ jwt: 'valid-jwt' }, request, response);

      // Assert — regenerate called before session values populated
      expect(session.regenerate).toHaveBeenCalledOnce();
      expect(session.set).toHaveBeenCalledWith('userId', MOCK_USER.id);
      expect(session.set).toHaveBeenCalledWith('tenantId', MOCK_TENANT.id);
      expect(session.set).toHaveBeenCalledWith('mid', MOCK_MID);
    });

    it('sets createdAt as Date.now() timestamp on session', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
        mid: MOCK_MID,
      });

      const session = createMockSession();
      const request = createMockRequest({
        headers: { accept: 'text/html' },
        session,
      });
      const response = createMockResponse();

      // Act
      await controller.loginPost({ jwt: 'valid-jwt' }, request, response);

      // Assert
      expect(session.set).toHaveBeenCalledWith('createdAt', FIXED_NOW);
    });
  });

  describe('session lifecycle on login() GET JWT path', () => {
    it('calls session.regenerate() when JWT provided via query', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
        mid: MOCK_MID,
      });

      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act
      await controller.login(undefined, 'valid-jwt-from-query', request);

      // Assert
      expect(session.regenerate).toHaveBeenCalledOnce();
    });

    it('sets createdAt on session for JWT login', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
        mid: MOCK_MID,
      });

      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act
      await controller.login(undefined, 'valid-jwt-from-query', request);

      // Assert
      expect(session.set).toHaveBeenCalledWith('createdAt', FIXED_NOW);
    });
  });

  describe('session lifecycle on callback()', () => {
    function setupCallbackState() {
      const nonce = 'test-nonce';
      const tssd = 'test-tssd';
      const state = encodeOAuthState({ tssd, nonce });
      const session = createMockSession({
        oauth_state_nonce: nonce,
        oauth_state_tssd: tssd,
        oauth_state_created_at: String(FIXED_NOW),
      });
      return { state, session };
    }

    it('calls session.regenerate() before setting session values', async () => {
      // Arrange
      authService.handleCallback.mockResolvedValue({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
        mid: MOCK_MID,
      });
      const { state, session } = setupCallbackState();
      const request = createMockRequest({ session });

      // Act
      await controller.callback('auth-code', state, request);

      // Assert
      expect(session.regenerate).toHaveBeenCalledOnce();
    });

    it('sets createdAt on session for OAuth callback', async () => {
      // Arrange
      authService.handleCallback.mockResolvedValue({
        user: MOCK_USER,
        tenant: MOCK_TENANT,
        mid: MOCK_MID,
      });
      const { state, session } = setupCallbackState();
      const request = createMockRequest({ session });

      // Act
      await controller.callback('auth-code', state, request);

      // Assert
      expect(session.set).toHaveBeenCalledWith('createdAt', FIXED_NOW);
    });
  });

  describe('logout hardening', () => {
    it('sets Cache-Control: no-store header on logout response', () => {
      // Arrange
      const session = createMockSession({
        userId: 'user-1',
        tenantId: 'tenant-1',
        mid: 'mid-1',
      });
      const request = createMockRequest({ session });
      const response = createMockResponse();

      // Act
      controller.logout(request, response);

      // Assert
      expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });

    it('returns { ok: true } on successful logout', () => {
      // Arrange
      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();

      // Act
      const result = controller.logout(request, response);

      // Assert
      expect(result).toEqual({ ok: true });
    });
  });
});
