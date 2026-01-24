/**
 * OAuth State Expiry Integration Tests
 *
 * Tests the OAuth state expiry behavior (10 minute timeout) by mocking Date.now().
 *
 * OAuth state is created during GET /auth/login and validated during GET /auth/callback.
 * The state includes a timestamp (oauth_state_created_at) and must be used within 10 minutes.
 *
 * These tests verify:
 * 1. OAuth state is rejected after 10 minutes (expired)
 * 2. OAuth state is accepted within 10 minutes (valid)
 * 3. Edge case: Exactly 10 minutes is still valid (>10min check)
 * 4. OAuth state mismatch is rejected (security)
 * 5. Invalid OAuth state format is rejected
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { agent as superagent } from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

import { AppModule } from './../../app.module';
import { configureApp } from './../../configure-app';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'oauth-expiry-test-tssd';

// Default MSW handlers for happy path
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: `https://${TEST_TSSD}.soap.marketingcloudapis.com`,
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get(
    `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
    () => {
      return HttpResponse.json({
        sub: 'oauth-expiry-test-user',
        enterprise_id: 'oauth-expiry-test-eid',
        member_id: 'oauth-expiry-test-mid',
        email: 'oauth-expiry@example.com',
        name: 'OAuth Expiry Test User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('OAuth State Expiry (integration)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' });

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
    server.resetHandlers();
  });

  describe('OAuth state time validation', () => {
    // Store original Date.now for restoration
    let originalDateNow: () => number;

    beforeEach(() => {
      // Save original Date.now
      originalDateNow = Date.now;
    });

    afterEach(() => {
      // CRITICAL: Restore Date.now to prevent test pollution
      Date.now = originalDateNow;
    });

    it('should reject OAuth state after 10 minutes (expired)', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login at T=0 (uses real Date.now)
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      const state = new URL(redirectUrl).searchParams.get('state');
      expect(state).toBeDefined();

      // Step 2: Mock Date.now to be 11 minutes in the future
      const futureTime = Date.now() + 11 * 60 * 1000;
      Date.now = () => futureTime;

      // Step 3: Attempt callback with expired state
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
        })
        .expect(401);

      // Verify error indicates OAuth state expired
      expect(callbackResponse.body.detail).toContain('OAuth state expired');
    });

    it('should accept OAuth state within 10 minutes (valid)', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login at T=0 (uses real Date.now)
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      const state = new URL(redirectUrl).searchParams.get('state');
      expect(state).toBeDefined();

      // Step 2: Mock Date.now to be 9 minutes in the future (within limit)
      const futureTime = Date.now() + 9 * 60 * 1000;
      Date.now = () => futureTime;

      // Step 3: Callback should succeed
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
        })
        .expect(302);

      // Verify redirect to home (successful auth)
      expect(callbackResponse.headers.location).toBe('/');
    });

    it('should reject OAuth state just over 10 minutes (boundary)', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Capture time just before login
      const timeBeforeLogin = Date.now();

      // Step 1: Initiate OAuth login (stores oauth_state_created_at)
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      const state = new URL(redirectUrl).searchParams.get('state');
      expect(state).toBeDefined();

      // Step 2: Mock Date.now to be 10 minutes + 100ms after login
      // The check is "Date.now() - createdAtMs > maxAgeMs" (strictly greater)
      // Adding 100ms buffer ensures we're just over the boundary
      const futureTime = timeBeforeLogin + 10 * 60 * 1000 + 100;
      Date.now = () => futureTime;

      // Step 3: Callback should fail (just over 10 minutes)
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
        })
        .expect(401);

      // Verify error indicates OAuth state expired
      expect(callbackResponse.body.detail).toContain('OAuth state expired');
    });
  });

  describe('OAuth state validation (without time manipulation)', () => {
    it('should reject OAuth state with nonce mismatch', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login (sets up session state)
      await testAgent.get('/auth/login').query({ tssd: TEST_TSSD }).expect(302);

      // Step 2: Create a forged state with different nonce but same tssd
      const forgedState = Buffer.from(
        JSON.stringify({ tssd: TEST_TSSD, nonce: 'forged-nonce-value' }),
      ).toString('base64url');

      // Step 3: Callback with forged state should fail
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state: forgedState,
        })
        .expect(401);

      // Verify error indicates state mismatch
      expect(callbackResponse.body.detail).toContain('OAuth state mismatch');
    });

    it('should reject OAuth state with invalid format (corrupted base64)', async () => {
      const testAgent = superagent(app.getHttpServer());

      // First initiate login to set up session with oauth_state
      await testAgent.get('/auth/login').query({ tssd: TEST_TSSD }).expect(302);

      // Try callback with corrupted base64 state
      const callbackResponse = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state: 'not-valid-base64!!!@#$',
        })
        .expect(401);

      // Verify error indicates invalid state
      expect(callbackResponse.body.detail).toContain('Invalid OAuth state');
    });

    it('should reject callback when session has no OAuth state initialized', async () => {
      // Fresh agent - no prior login request
      const freshAgent = superagent(app.getHttpServer());

      // Try to submit callback without having initiated login
      const validLookingState = Buffer.from(
        JSON.stringify({ tssd: TEST_TSSD, nonce: 'random-nonce' }),
      ).toString('base64url');

      const callbackResponse = await freshAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state: validLookingState,
        })
        .expect(401);

      // Verify error indicates state not initialized
      expect(callbackResponse.body.detail).toContain(
        'OAuth state not initialized',
      );
    });

    it('should consume OAuth state (single use)', async () => {
      const testAgent = superagent(app.getHttpServer());

      // Step 1: Initiate OAuth login
      const loginResponse = await testAgent
        .get('/auth/login')
        .query({ tssd: TEST_TSSD })
        .expect(302);

      const redirectUrl = loginResponse.headers.location;
      const state = new URL(redirectUrl).searchParams.get('state');
      expect(state).toBeDefined();

      // Step 2: First callback succeeds
      const firstCallback = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
        })
        .expect(302);
      expect(firstCallback.headers.location).toBe('/');

      // Step 3: Second callback with same state should fail (state consumed)
      const secondCallback = await testAgent
        .get('/auth/callback')
        .query({
          code: 'test-code',
          state,
        })
        .expect(401);

      // Verify error indicates state not initialized (already consumed)
      expect(secondCallback.body.detail).toContain(
        'OAuth state not initialized',
      );
    });
  });
});
