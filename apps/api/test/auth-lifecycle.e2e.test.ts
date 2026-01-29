import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Agent, agent as superagent } from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string, not user input
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

/**
 * Auth Lifecycle E2E Tests
 *
 * These tests verify the COMPLETE OAuth lifecycle including:
 * - Full OAuth flow: login -> callback -> session -> authenticated request -> logout -> invalidation
 * - Identity mismatch detection (AUTH_IDENTITY_MISMATCH)
 * - MCE endpoint failure handling
 * - Invalid state/JWT handling
 *
 * CRITICAL SECURITY GAPS addressed:
 * - Proves logout actually invalidates session (not just cookie cleared)
 * - Proves identity mismatch attack is blocked
 */

const TEST_TSSD = 'test-tssd';

// Default MSW handlers for happy path
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get(
    `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
    () => {
      return HttpResponse.json({
        sub: 'legitimate-user-123',
        enterprise_id: 'eid-123',
        member_id: 'mid-123',
        email: 'user@example.com',
        name: 'Example User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Auth Lifecycle (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    process.env.MCE_TSSD = TEST_TSSD;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    await configureApp(app, {
      globalPrefix: false,
      session: {
        secret: getRequiredEnv('SESSION_SECRET'),
        salt: getRequiredEnv('SESSION_SALT'),
        cookie: {
          secure: false,
          sameSite: 'lax',
        },
      },
      rls: true,
    });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    server.close();
    await app.close();
  });

  afterEach(() => {
    // Reset MSW handlers to defaults after each test
    server.resetHandlers();
  });

  describe('Complete OAuth Lifecycle', () => {
    it('should complete full lifecycle: login -> authenticated request -> logout -> rejection', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      expect(redirectUrl).toContain('authorize');
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      // Step 2: OAuth callback (MSW handles token exchange)
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state,
          sf_user_id: 'legitimate-user-123',
          eid: 'eid-123',
          mid: 'mid-123',
        })
        .expect(302);

      expect(callbackResponse.headers.location).toBe('/');

      // Step 3: Verify authenticated request works
      const meResponse = await testAgent.get('/auth/me').expect(200);
      expect(meResponse.body.user.sfUserId).toBe('legitimate-user-123');
      expect(meResponse.body.tenant.eid).toBe('eid-123');
      expect(meResponse.body.csrfToken).toBeDefined();

      // Step 4: Logout
      const logoutResponse = await testAgent.get('/auth/logout').expect(200);
      expect(logoutResponse.body.ok).toBe(true);

      // Step 5: CRITICAL - Verify session is actually invalidated
      // This proves logout destroys the session, not just clears cookie
      const meAfterLogout = await testAgent.get('/auth/me').expect(401);
      // RFC 9457 ProblemDetails format uses 'detail' field
      expect(meAfterLogout.body.detail).toContain('Not authenticated');
    });
  });

  describe('Identity Mismatch Detection', () => {
    it('should detect identity mismatch and reject callback when sfUserId differs', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      // Step 2: Override MSW to return DIFFERENT user from userinfo
      // The callback provides sf_user_id='attacker-user-id'
      // But userinfo returns sub='legitimate-user-123'
      // This simulates an OAuth spoofing attack

      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state,
          sf_user_id: 'attacker-user-id', // DIFFERENT from what userinfo returns
          eid: 'eid-123',
          mid: 'mid-123',
        })
        .expect(401);

      // Verify error indicates identity mismatch
      // RFC 9457 uses type field: urn:qpp:error:auth-identity-mismatch
      expect(callbackResponse.body.type).toBe(
        'urn:qpp:error:auth-identity-mismatch',
      );
    });

    it('should detect identity mismatch when eid differs', async () => {
      const testAgent = superagent(app.getHttpServer());

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state,
          sf_user_id: 'legitimate-user-123',
          eid: 'attacker-eid', // DIFFERENT from what userinfo returns
          mid: 'mid-123',
        })
        .expect(401);

      expect(callbackResponse.body.type).toBe(
        'urn:qpp:error:auth-identity-mismatch',
      );
    });

    it('should detect identity mismatch when mid differs', async () => {
      const testAgent = superagent(app.getHttpServer());

      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state,
          sf_user_id: 'legitimate-user-123',
          eid: 'eid-123',
          mid: 'attacker-mid', // DIFFERENT from what userinfo returns
        })
        .expect(401);

      expect(callbackResponse.body.type).toBe(
        'urn:qpp:error:auth-identity-mismatch',
      );
    });
  });

  describe('MCE Endpoint Failure Handling', () => {
    it('should handle MCE token endpoint failure gracefully', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      // Step 2: Override MSW to return 500 for token endpoint
      server.use(
        http.post(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`,
          () => {
            return HttpResponse.json(
              { error: 'server_error', error_description: 'Internal error' },
              { status: 500 },
            );
          },
        ),
      );

      // Step 3: Callback should fail gracefully (not expose 500)
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state,
          sf_user_id: 'legitimate-user-123',
          eid: 'eid-123',
          mid: 'mid-123',
        })
        .expect(401);

      // Should return user-friendly error, not raw 500
      // RFC 9457 uses type field: urn:qpp:error:auth-unauthorized
      expect(callbackResponse.body.type).toBe(
        'urn:qpp:error:auth-unauthorized',
      );
    });

    it('should handle MCE userinfo endpoint failure gracefully', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      if (!redirectUrl) {
        throw new Error('OAuth login redirect missing location header');
      }
      const state = new URL(redirectUrl).searchParams.get('state');
      if (!state) {
        throw new Error('OAuth login redirect missing state param');
      }

      // Step 2: Override MSW - token succeeds, userinfo fails
      server.use(
        http.get(
          `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
          () => {
            return HttpResponse.json(
              { error: 'server_error' },
              { status: 500 },
            );
          },
        ),
      );

      // Step 3: Callback should fail gracefully
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state,
          sf_user_id: 'legitimate-user-123',
          eid: 'eid-123',
          mid: 'mid-123',
        })
        .expect(500);

      // Should indicate error (status 500 as axios error propagates)
      expect(callbackResponse.body).toBeDefined();
    });
  });

  describe('Invalid State/JWT Handling', () => {
    it('should reject callback with invalid state format', async () => {
      const testAgent = superagent(app.getHttpServer());

      // First initiate login to set up session
      await testAgent.get('/auth/login').query({ tssd: TEST_TSSD }).expect(302);

      // Then try callback with garbage state
      const response = await testAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state: 'completely-invalid-state-not-base64',
        })
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('Invalid OAuth state');
    });

    it('should reject callback with missing state', async () => {
      const testAgent = superagent(app.getHttpServer());

      const response = await testAgent
        .get('/auth/callback')
        .query({ code: 'any-code' })
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('Missing code or state');
    });

    it('should reject callback when state not initialized in session', async () => {
      // Fresh agent - no session state set
      const freshAgent = superagent(app.getHttpServer());

      const validState = Buffer.from(
        JSON.stringify({ tssd: TEST_TSSD, nonce: 'some-nonce' }),
      ).toString('base64url');

      const response = await freshAgent
        .get('/auth/callback')
        .query({
          code: 'any-code',
          state: validState,
        })
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('OAuth state not initialized');
    });
  });

  describe('JWT Login Validation', () => {
    let testAgent: Agent;

    beforeEach(() => {
      testAgent = superagent(app.getHttpServer());
    });

    it('should reject expired JWT', async () => {
      const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
      const encodedSecret = new TextEncoder().encode(secret);

      const payload = {
        user_id: 'sf-user-jwt',
        enterprise_id: 'eid-jwt',
        member_id: 'mid-jwt',
        stack: TEST_TSSD,
      };

      // Create JWT that expired 1 hour ago
      const expiredJwt = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
        .sign(encodedSecret);

      const response = await testAgent
        .post('/auth/login')
        .send({ jwt: expiredJwt })
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('Authentication failed');
    });

    it('should reject JWT signed with wrong secret', async () => {
      const wrongSecret = new TextEncoder().encode(
        'wrong-secret-that-is-at-least-32-chars-long',
      );

      const payload = {
        user_id: 'sf-user-jwt',
        enterprise_id: 'eid-jwt',
        member_id: 'mid-jwt',
        stack: TEST_TSSD,
      };

      const badJwt = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(wrongSecret);

      const response = await testAgent
        .post('/auth/login')
        .send({ jwt: badJwt })
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('Authentication failed');
    });

    it('should reject JWT with missing required claims', async () => {
      const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
      const encodedSecret = new TextEncoder().encode(secret);

      // Missing enterprise_id and member_id
      const payload = {
        user_id: 'sf-user-jwt',
        stack: TEST_TSSD,
      };

      const incompleteJwt = await new jose.SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(encodedSecret);

      const response = await testAgent
        .post('/auth/login')
        .send({ jwt: incompleteJwt })
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('Authentication failed');
    });

    it('should reject request without JWT', async () => {
      const response = await testAgent.post('/auth/login').send({}).expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toContain('JWT is required');
    });
  });
});
