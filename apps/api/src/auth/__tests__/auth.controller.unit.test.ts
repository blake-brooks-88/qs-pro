import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService, SessionGuard } from '@qpp/backend-shared';
import {
  createMockUserSession,
  createSessionGuardMock,
  resetFactories,
} from '@qpp/test-utils';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditService } from '../../audit/audit.service';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { AuthController } from '../auth.controller';

type SecureSession = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(): void;
  regenerate(ignoreFields?: string[]): void;
};

type SessionRequest = FastifyRequest & { session?: SecureSession };

interface OAuthStatePayload {
  tssd: string;
  nonce: string;
}

function createMockSession(
  initialData: Record<string, unknown> = {},
): SecureSession {
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
  session?: SecureSession | undefined;
}): SessionRequest {
  return {
    headers: options.headers ?? {},
    body: options.body,
    session: options.session,
  } as unknown as SessionRequest;
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

function createMockConfigService() {
  return {
    get: vi.fn(),
  };
}

function encodeOAuthState(payload: OAuthStatePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeOAuthState(state: string): OAuthStatePayload {
  const json = Buffer.from(state, 'base64url').toString('utf8');
  return JSON.parse(json) as OAuthStatePayload;
}

describe('AuthController', () => {
  let controller: AuthController;
  let authService: ReturnType<typeof createMockAuthService>;
  let configService: ReturnType<typeof createMockConfigService>;

  beforeEach(async () => {
    resetFactories();

    authService = createMockAuthService();
    configService = createMockConfigService();
    configService.get.mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: configService },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue(createSessionGuardMock())
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('loginPost()', () => {
    const mockUser = { id: 'user-1', sfUserId: 'sf-user-1' };
    const mockTenant = { id: 'tenant-1', eid: 'eid-1', tssd: 'test-tssd' };
    const mockMid = 'mid-1';

    it('returns redirect when Accept header is not JSON', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: mockUser,
        tenant: mockTenant,
        mid: mockMid,
      });

      const session = createMockSession();
      const request = createMockRequest({
        headers: { accept: 'text/html' },
        session,
      });
      const response = createMockResponse();
      const body = { jwt: 'valid-jwt-token' };

      // Act
      const result = await controller.loginPost(body, request, response);

      // Assert
      expect(result).toEqual({ url: '/', statusCode: 302 });
    });

    it('returns JSON response when Accept header is application/json', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: mockUser,
        tenant: mockTenant,
        mid: mockMid,
      });

      const session = createMockSession();
      const request = createMockRequest({
        headers: { accept: 'application/json' },
        session,
      });
      const response = createMockResponse();
      const body = { jwt: 'valid-jwt-token' };

      // Act
      const result = await controller.loginPost(body, request, response);

      // Assert
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.send).toHaveBeenCalledWith({ ok: true });
      expect(result).toBeUndefined();
    });

    it('sets session data on successful login', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: mockUser,
        tenant: mockTenant,
        mid: mockMid,
      });

      const session = createMockSession();
      const request = createMockRequest({
        headers: { accept: 'text/html' },
        session,
      });
      const response = createMockResponse();
      const body = { jwt: 'valid-jwt-token' };

      // Act
      await controller.loginPost(body, request, response);

      // Assert
      expect(session.set).toHaveBeenCalledWith('userId', mockUser.id);
      expect(session.set).toHaveBeenCalledWith('tenantId', mockTenant.id);
      expect(session.set).toHaveBeenCalledWith('mid', mockMid);
    });

    it('throws UnauthorizedException when JWT is missing', async () => {
      // Arrange
      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const body = { jwt: '' };

      // Act & Assert
      await expect(
        controller.loginPost(body, request, response),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.loginPost(body, request, response),
      ).rejects.toThrow('JWT is required');
    });

    it('throws InternalServerErrorException when session unavailable', async () => {
      // Arrange
      const request = createMockRequest({ session: undefined });
      const response = createMockResponse();
      const body = { jwt: 'valid-jwt-token' };

      // Act & Assert
      await expect(
        controller.loginPost(body, request, response),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        controller.loginPost(body, request, response),
      ).rejects.toThrow('Session not available');
    });

    it('throws UnauthorizedException when handleJwtLogin fails', async () => {
      // Arrange
      authService.handleJwtLogin.mockRejectedValue(new Error('Auth failed'));

      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const body = { jwt: 'valid-jwt-token' };

      // Act & Assert
      await expect(
        controller.loginPost(body, request, response),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.loginPost(body, request, response),
      ).rejects.toThrow('Authentication failed');
    });
  });

  describe('me()', () => {
    const mockUser = { id: 'user-1', sfUserId: 'sf-user-1' };
    const mockTenant = { id: 'tenant-1', eid: 'eid-1', tssd: 'test-tssd' };

    it('returns user, tenant, and csrfToken for valid session', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(mockUser);
      authService.findTenantById.mockResolvedValue(mockTenant);
      authService.refreshToken.mockResolvedValue({
        accessToken: 'token',
        tssd: 'test-tssd',
      });

      const session = createMockSession({ csrfToken: 'existing-csrf' });
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const userSession: UserSession = createMockUserSession();

      // Act
      const result = await controller.me(userSession, request, response);

      // Assert
      expect(result).toEqual({
        user: mockUser,
        tenant: mockTenant,
        csrfToken: 'existing-csrf',
      });
    });

    it('generates csrfToken if not present in session', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(mockUser);
      authService.findTenantById.mockResolvedValue(mockTenant);
      authService.refreshToken.mockResolvedValue({
        accessToken: 'token',
        tssd: 'test-tssd',
      });

      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const userSession: UserSession = createMockUserSession();

      // Act
      const result = await controller.me(userSession, request, response);

      // Assert
      expect(session.set).toHaveBeenCalledWith(
        'csrfToken',
        expect.any(String) as string,
      );
      expect(result.csrfToken).toBeDefined();
      expect(typeof result.csrfToken).toBe('string');
      expect((result.csrfToken as string).length).toBeGreaterThan(0);
    });

    it('throws UnauthorizedException when user not found', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(null);
      authService.findTenantById.mockResolvedValue(mockTenant);

      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const userSession: UserSession = createMockUserSession();

      // Act & Assert
      await expect(
        controller.me(userSession, request, response),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.me(userSession, request, response),
      ).rejects.toThrow('Not authenticated');
      expect(session.delete).toHaveBeenCalled();
    });

    it('throws UnauthorizedException when tenant not found', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(mockUser);
      authService.findTenantById.mockResolvedValue(null);

      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const userSession: UserSession = createMockUserSession();

      // Act & Assert
      await expect(
        controller.me(userSession, request, response),
      ).rejects.toThrow(UnauthorizedException);
      expect(session.delete).toHaveBeenCalled();
    });

    it('returns reauth_required when token refresh fails', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(mockUser);
      authService.findTenantById.mockResolvedValue(mockTenant);
      authService.refreshToken.mockRejectedValue(new Error('Token expired'));

      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const userSession: UserSession = createMockUserSession();

      // Act
      const result = await controller.me(userSession, request, response);

      // Assert
      expect(response.status).toHaveBeenCalledWith(401);
      expect(result).toEqual({
        reason: 'reauth_required',
        message: 'Token expired',
      });
    });

    it('deletes session when token refresh fails', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(mockUser);
      authService.findTenantById.mockResolvedValue(mockTenant);
      authService.refreshToken.mockRejectedValue(new Error('Token expired'));

      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();
      const userSession: UserSession = createMockUserSession();

      // Act
      await controller.me(userSession, request, response);

      // Assert
      expect(session.delete).toHaveBeenCalled();
    });
  });

  describe('login()', () => {
    const mockUser = { id: 'user-1', sfUserId: 'sf-user-1' };
    const mockTenant = { id: 'tenant-1', eid: 'eid-1', tssd: 'test-tssd' };
    const mockMid = 'mid-1';

    it('redirects to home when valid session exists', async () => {
      // Arrange
      authService.findUserById.mockResolvedValue(mockUser);
      authService.findTenantById.mockResolvedValue(mockTenant);

      const session = createMockSession({
        userId: mockUser.id,
        tenantId: mockTenant.id,
        mid: mockMid,
      });
      const request = createMockRequest({ session });

      // Act
      const result = await controller.login(undefined, undefined, request);

      // Assert
      expect(result).toEqual({ url: '/', statusCode: 302 });
    });

    it('clears legacy session when MID is missing', async () => {
      // Arrange
      configService.get.mockReturnValue('config-tssd');
      authService.getAuthUrl.mockReturnValue(
        'https://config-tssd.auth.marketingcloudapis.com/v2/authorize?...',
      );

      const session = createMockSession({
        userId: mockUser.id,
        tenantId: mockTenant.id,
      });
      const request = createMockRequest({ session });

      // Act
      await controller.login(undefined, undefined, request);

      // Assert
      expect(session.set).toHaveBeenCalledWith('userId', undefined);
      expect(session.set).toHaveBeenCalledWith('tenantId', undefined);
      expect(session.set).toHaveBeenCalledWith('mid', undefined);
    });

    it('processes JWT from query parameter', async () => {
      // Arrange
      authService.handleJwtLogin.mockResolvedValue({
        user: mockUser,
        tenant: mockTenant,
        mid: mockMid,
      });

      const session = createMockSession();
      const request = createMockRequest({ session });
      const jwt = 'valid-jwt-from-query';

      // Act
      const result = await controller.login(undefined, jwt, request);

      // Assert
      expect(authService.handleJwtLogin).toHaveBeenCalledWith(jwt);
      expect(session.set).toHaveBeenCalledWith('userId', mockUser.id);
      expect(session.set).toHaveBeenCalledWith('tenantId', mockTenant.id);
      expect(session.set).toHaveBeenCalledWith('mid', mockMid);
      expect(result).toEqual({ url: '/', statusCode: 302 });
    });

    it('uses explicit TSSD from query parameter', async () => {
      // Arrange
      authService.getAuthUrl.mockReturnValue(
        'https://my-tssd.auth.marketingcloudapis.com/v2/authorize?...',
      );

      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act
      await controller.login('MY-TSSD', undefined, request);

      // Assert
      expect(authService.getAuthUrl).toHaveBeenCalledWith(
        'my-tssd',
        expect.any(String) as string,
      );
    });

    it('falls back to MCE_TSSD config', async () => {
      // Arrange
      configService.get.mockReturnValue('config-tssd');
      authService.getAuthUrl.mockReturnValue(
        'https://config-tssd.auth.marketingcloudapis.com/v2/authorize?...',
      );

      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act
      await controller.login(undefined, undefined, request);

      // Assert
      expect(configService.get).toHaveBeenCalledWith('MCE_TSSD');
      expect(authService.getAuthUrl).toHaveBeenCalledWith(
        'config-tssd',
        expect.any(String) as string,
      );
    });

    it('throws UnauthorizedException when TSSD missing (non-embed)', async () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      const session = createMockSession();
      const request = createMockRequest({
        headers: { referer: undefined, 'sec-fetch-dest': undefined },
        session,
      });

      // Act & Assert
      await expect(
        controller.login(undefined, undefined, request),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        controller.login(undefined, undefined, request),
      ).rejects.toThrow('TSSD is required');
    });

    it('redirects to home when TSSD missing in embed context (MCE referer)', async () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      const session = createMockSession();
      const request = createMockRequest({
        headers: { referer: 'https://mc.exacttarget.com/some-page' },
        session,
      });

      // Act
      const result = await controller.login(undefined, undefined, request);

      // Assert
      expect(result).toEqual({ url: '/', statusCode: 302 });
    });

    it('redirects to home when TSSD missing in embed context (iframe)', async () => {
      // Arrange
      configService.get.mockReturnValue(undefined);

      const session = createMockSession();
      const request = createMockRequest({
        headers: { 'sec-fetch-dest': 'iframe' },
        session,
      });

      // Act
      const result = await controller.login(undefined, undefined, request);

      // Assert
      expect(result).toEqual({ url: '/', statusCode: 302 });
    });

    it('generates OAuth state and redirects to MCE', async () => {
      // Arrange
      const expectedAuthUrl =
        'https://test-tssd.auth.marketingcloudapis.com/v2/authorize?...';
      configService.get.mockReturnValue('test-tssd');
      authService.getAuthUrl.mockReturnValue(expectedAuthUrl);

      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act
      const result = await controller.login(undefined, undefined, request);

      // Assert
      expect(session.set).toHaveBeenCalledWith(
        'oauth_state_nonce',
        expect.any(String) as string,
      );
      expect(session.set).toHaveBeenCalledWith('oauth_state_tssd', 'test-tssd');
      expect(session.set).toHaveBeenCalledWith(
        'oauth_state_created_at',
        expect.any(String) as string,
      );
      expect(result).toEqual({ url: expectedAuthUrl, statusCode: 302 });
    });

    it('always generates a fresh OAuth state for login calls', async () => {
      // Arrange
      const existingNonce = 'stale-nonce';
      const expectedAuthUrl =
        'https://test-tssd.auth.marketingcloudapis.com/v2/authorize?state=fresh';
      configService.get.mockReturnValue('test-tssd');
      authService.getAuthUrl.mockReturnValue(expectedAuthUrl);

      const session = createMockSession({
        oauth_state_nonce: existingNonce,
        oauth_state_tssd: 'test-tssd',
        oauth_state_created_at: String(Date.now() - 5 * 60 * 1000),
      });
      const request = createMockRequest({ session });

      // Act
      const result = await controller.login(undefined, undefined, request);

      // Assert
      const stateArg = authService.getAuthUrl.mock.calls[0]?.[1] as
        | string
        | undefined;
      expect(typeof stateArg).toBe('string');
      const decoded = decodeOAuthState(stateArg as string);
      expect(decoded.tssd).toBe('test-tssd');
      expect(decoded.nonce).not.toBe(existingNonce);
      expect(session.set).toHaveBeenCalledWith(
        'oauth_state_nonce',
        expect.any(String) as string,
      );
      expect(result).toEqual({ url: expectedAuthUrl, statusCode: 302 });
    });
  });

  describe('callback()', () => {
    const mockUser = { id: 'user-1', sfUserId: 'sf-user-1' };
    const mockTenant = { id: 'tenant-1', eid: 'eid-1', tssd: 'test-tssd' };
    const mockMid = 'mid-1';

    it('throws InternalServerErrorException when session unavailable', async () => {
      // Arrange
      const request = createMockRequest({ session: undefined });

      // Act & Assert
      await expect(
        controller.callback('code', 'state', request),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        controller.callback('code', 'state', request),
      ).rejects.toThrow('Session not available');
    });

    it('throws UnauthorizedException when code missing', async () => {
      // Arrange
      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act & Assert
      await expect(controller.callback('', 'state', request)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.callback('', 'state', request)).rejects.toThrow(
        'Missing code or state',
      );
    });

    it('throws UnauthorizedException when state missing', async () => {
      // Arrange
      const session = createMockSession();
      const request = createMockRequest({ session });

      // Act & Assert
      await expect(controller.callback('code', '', request)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(controller.callback('code', '', request)).rejects.toThrow(
        'Missing code or state',
      );
    });

    it('throws UnauthorizedException for expired state', async () => {
      // Arrange
      const nonce = 'test-nonce';
      const tssd = 'test-tssd';
      const expiredTime = String(Date.now() - 11 * 60 * 1000); // 11 minutes ago
      const state = encodeOAuthState({ tssd, nonce });

      const session = createMockSession({
        oauth_state_nonce: nonce,
        oauth_state_tssd: tssd,
        oauth_state_created_at: expiredTime,
      });
      const request = createMockRequest({ session });

      // Act & Assert
      await expect(controller.callback('code', state, request)).rejects.toThrow(
        new UnauthorizedException('OAuth state expired'),
      );
    });

    it('throws UnauthorizedException for mismatched nonce', async () => {
      // Arrange
      const tssd = 'test-tssd';
      const validTime = String(Date.now());
      const state = encodeOAuthState({ tssd, nonce: 'different-nonce' });

      const session = createMockSession({
        oauth_state_nonce: 'expected-nonce',
        oauth_state_tssd: tssd,
        oauth_state_created_at: validTime,
      });
      const request = createMockRequest({ session });

      // Act & Assert
      await expect(controller.callback('code', state, request)).rejects.toThrow(
        new UnauthorizedException('OAuth state mismatch'),
      );
    });

    it('successful callback sets session and redirects', async () => {
      // Arrange
      const nonce = 'test-nonce';
      const tssd = 'test-tssd';
      const validTime = String(Date.now());
      const state = encodeOAuthState({ tssd, nonce });

      authService.handleCallback.mockResolvedValue({
        user: mockUser,
        tenant: mockTenant,
        mid: mockMid,
      });

      const session = createMockSession({
        oauth_state_nonce: nonce,
        oauth_state_tssd: tssd,
        oauth_state_created_at: validTime,
      });
      const request = createMockRequest({ session });

      // Act
      const result = await controller.callback('auth-code', state, request);

      // Assert
      expect(authService.handleCallback).toHaveBeenCalledWith(
        tssd,
        'auth-code',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(session.set).toHaveBeenCalledWith('oauth_state_nonce', undefined);
      expect(session.set).toHaveBeenCalledWith('oauth_state_tssd', undefined);
      expect(session.set).toHaveBeenCalledWith(
        'oauth_state_created_at',
        undefined,
      );
      expect(session.set).toHaveBeenCalledWith('userId', mockUser.id);
      expect(session.set).toHaveBeenCalledWith('tenantId', mockTenant.id);
      expect(session.set).toHaveBeenCalledWith('mid', mockMid);
      expect(result).toEqual({ url: '/', statusCode: 302 });
    });

    it('consumes OAuth state before callback token exchange', async () => {
      // Arrange
      const nonce = 'test-nonce';
      const tssd = 'test-tssd';
      const validTime = String(Date.now());
      const state = encodeOAuthState({ tssd, nonce });

      authService.handleCallback.mockRejectedValue(
        new UnauthorizedException('Token exchange failed'),
      );

      const session = createMockSession({
        oauth_state_nonce: nonce,
        oauth_state_tssd: tssd,
        oauth_state_created_at: validTime,
      });
      const request = createMockRequest({ session });

      // Act + Assert
      await expect(
        controller.callback('auth-code', state, request),
      ).rejects.toThrow(UnauthorizedException);
      expect(session.set).toHaveBeenCalledWith('oauth_state_nonce', undefined);
      expect(session.set).toHaveBeenCalledWith('oauth_state_tssd', undefined);
      expect(session.set).toHaveBeenCalledWith(
        'oauth_state_created_at',
        undefined,
      );
    });
  });

  describe('refresh()', () => {
    it('calls AuthService.refreshToken with session data', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue({
        accessToken: 'new-token',
        tssd: 'test-tssd',
      });

      const userSession: UserSession = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        mid: 'mid-1',
      };
      const request = createMockRequest({ session: createMockSession() });

      // Act
      await controller.refresh(userSession, request);

      // Assert
      expect(authService.refreshToken).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
      );
    });

    it('returns ok:true on success', async () => {
      // Arrange
      authService.refreshToken.mockResolvedValue({
        accessToken: 'new-token',
        tssd: 'test-tssd',
      });

      const userSession: UserSession = createMockUserSession();
      const request = createMockRequest({ session: createMockSession() });

      // Act
      const result = await controller.refresh(userSession, request);

      // Assert
      expect(result).toEqual({ ok: true });
    });

    it('propagates AuthService errors', async () => {
      // Arrange
      const error = new Error('Refresh failed');
      authService.refreshToken.mockRejectedValue(error);

      const userSession: UserSession = createMockUserSession();
      const request = createMockRequest({ session: createMockSession() });

      // Act & Assert
      await expect(controller.refresh(userSession, request)).rejects.toThrow(
        'Refresh failed',
      );
    });
  });

  describe('logout()', () => {
    it('deletes session', () => {
      // Arrange
      const session = createMockSession({
        userId: 'user-1',
        tenantId: 'tenant-1',
      });
      const request = createMockRequest({ session });
      const response = createMockResponse();

      // Act
      controller.logout(request, response);

      // Assert
      expect(session.delete).toHaveBeenCalled();
    });

    it('returns ok:true', () => {
      // Arrange
      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();

      // Act
      const result = controller.logout(request, response);

      // Assert
      expect(result).toEqual({ ok: true });
    });

    it('sets Cache-Control: no-store header', () => {
      // Arrange
      const session = createMockSession();
      const request = createMockRequest({ session });
      const response = createMockResponse();

      // Act
      controller.logout(request, response);

      // Assert
      expect(response.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });
  });
});
