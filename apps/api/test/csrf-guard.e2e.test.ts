import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { agent as superagent } from 'supertest';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

const server = setupServer(
  http.post('https://test-tssd.auth.marketingcloudapis.com/v2/token', () => {
    return HttpResponse.json({
      access_token: 'csrf-test-access-token',
      refresh_token: 'csrf-test-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get('https://test-tssd.auth.marketingcloudapis.com/v2/userinfo', () => {
    return HttpResponse.json({
      sub: 'csrf-test-user',
      enterprise_id: 'csrf-test-eid',
      member_id: 'csrf-test-mid',
      email: 'csrf-test@example.com',
      name: 'CSRF Test User',
    });
  }),
);

/**
 * CSRF Guard E2E Tests
 *
 * CRITICAL: These tests prove that CsrfGuard ACTUALLY validates CSRF tokens.
 *
 * Why this matters:
 * - CSRF protection prevents cross-site request forgery attacks
 * - Without these tests, we cannot prove CSRF tokens are validated
 * - This test uses REAL CsrfGuard execution (no mocking)
 *
 * CsrfGuard behavior:
 * - GET, HEAD, OPTIONS requests bypass CSRF validation
 * - POST, PUT, DELETE, PATCH require x-csrf-token header
 * - Token must match session-stored csrfToken (timing-safe comparison)
 */

describe('CSRF Guard (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    process.env.MCE_TSSD = 'test-tssd';

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

  async function createAuthenticatedAgent(): Promise<{
    agent: ReturnType<typeof superagent>;
    csrfToken: string;
  }> {
    const testAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: 'csrf-user-id',
      enterprise_id: 'csrf-eid',
      member_id: 'csrf-mid',
      stack: 'test-tssd',
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    await testAgent.post('/auth/login').send({ jwt }).expect(302);

    // Get CSRF token from /auth/me response
    const meResponse = await testAgent.get('/auth/me').expect(200);
    const csrfToken = meResponse.body.csrfToken;

    expect(csrfToken).toBeDefined();
    expect(typeof csrfToken).toBe('string');
    expect(csrfToken.length).toBeGreaterThan(0);

    return { agent: testAgent, csrfToken };
  }

  describe('CSRF Token Validation', () => {
    it('should reject POST /runs without x-csrf-token header', async () => {
      const { agent } = await createAuthenticatedAgent();

      // POST without CSRF token - should be rejected
      const response = await agent
        .post('/runs')
        .send({ sqlText: 'SELECT * FROM test' })
        .expect(401);

      // CSRF rejection returns 401 Unauthorized
      expect(response.body.detail).toBe('Missing CSRF token');
      expect(response.body.status).toBe(401);
      expect(response.body.title).toBe('Unauthorized');
    });

    it('should reject POST /runs with invalid x-csrf-token', async () => {
      const { agent } = await createAuthenticatedAgent();

      // POST with invalid CSRF token
      const response = await agent
        .post('/runs')
        .set('x-csrf-token', 'invalid-token-that-does-not-match')
        .send({ sqlText: 'SELECT * FROM test' })
        .expect(401);

      expect(response.body.detail).toBe('Invalid CSRF token');
      expect(response.body.status).toBe(401);
    });

    it('should accept POST /runs with valid x-csrf-token', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // POST with valid CSRF token - should proceed to controller logic
      // Note: This will fail at the controller level (no queue connection)
      // but the CSRF guard should pass
      const response = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT * FROM test' });

      // CSRF guard passed if we didn't get a 401 with CSRF-related rejection
      expect(response.status).not.toBe(401);

      // Verify error detail (if any) is not a CSRF rejection
      const detail =
        typeof response.body?.detail === 'string' ? response.body.detail : '';
      expect(detail).not.toMatch(/CSRF/i);
    });

    it('should allow GET requests without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      // GET without CSRF token - should be allowed
      const response = await agent.get('/auth/me').expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.tenant).toBeDefined();
      expect(response.body.csrfToken).toBeDefined();
    });

    it('should reject POST /runs/:id/cancel without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      // POST cancel without CSRF token
      const response = await agent.post('/runs/any-run-id/cancel').expect(401);

      expect(response.body.detail).toBe('Missing CSRF token');
      expect(response.body.status).toBe(401);
    });

    it('should accept x-xsrf-token header (alternate header name)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // Use alternate header name x-xsrf-token
      const response = await agent
        .post('/runs')
        .set('x-xsrf-token', csrfToken)
        .send({ sqlText: 'SELECT * FROM test' });

      // CSRF passes - we get past the guard
      expect(response.status).not.toBe(401);
    });

    it('should accept x-csrftoken header (alternate header name)', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      // Use alternate header name x-csrftoken (no hyphen)
      const response = await agent
        .post('/runs')
        .set('x-csrftoken', csrfToken)
        .send({ sqlText: 'SELECT * FROM test' });

      // CSRF passes - we get past the guard
      expect(response.status).not.toBe(401);
    });
  });

  describe('Safe Methods Bypass', () => {
    it('should allow GET without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      // GET is a safe method - no CSRF required
      const response = await agent.get('/auth/refresh').expect(200);

      expect(response.body.ok).toBe(true);
    });

    it('should allow HEAD requests without CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      // HEAD is a safe method - no CSRF required
      // Most endpoints don't explicitly support HEAD, but the guard should pass
      // Use a simple endpoint that exists
      await agent.head('/health').expect(200);
    });

    it('should allow OPTIONS requests without CSRF token', async () => {
      // OPTIONS is typically handled by CORS middleware. In production with CORS enabled,
      // this would return 204. In test environment without CORS, it returns 404.
      // The key point: CsrfGuard code explicitly bypasses OPTIONS requests.
      // We test this by verifying OPTIONS doesn't return 401 (CSRF rejection).
      const response = await request(app.getHttpServer()).options('/runs');

      // CSRF guard should not block OPTIONS - it should pass through
      // 404 (no route match for OPTIONS) or 204 (CORS) are both acceptable
      // The important thing: NOT 401 (CSRF rejection)
      expect(response.status).not.toBe(401);
      expect([200, 204, 404]).toContain(response.status);
    });
  });

  describe('Session Requirement', () => {
    it('should reject POST with CSRF token but no session', async () => {
      // Fresh request without any session
      const response = await request(app.getHttpServer())
        .post('/runs')
        .set('x-csrf-token', 'some-token')
        .send({ sqlText: 'SELECT * FROM test' })
        .expect(401);

      // SessionGuard runs before CsrfGuard (both are applied to ShellQueryController)
      // So we get "Not authenticated" from SessionGuard
      expect(response.body.detail).toBe('Not authenticated');
    });
  });

  describe('Error Response Format', () => {
    it('should return RFC 9457 compliant error for missing CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const response = await agent
        .post('/runs')
        .send({ sqlText: 'SELECT * FROM test' })
        .expect(401);

      // Verify RFC 9457 ProblemDetails format
      expect(response.body).toMatchObject({
        type: 'urn:qpp:error:http-401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing CSRF token',
        instance: '/runs',
      });
    });

    it('should return RFC 9457 compliant error for invalid CSRF token', async () => {
      const { agent } = await createAuthenticatedAgent();

      const response = await agent
        .post('/runs')
        .set('x-csrf-token', 'invalid')
        .send({ sqlText: 'SELECT * FROM test' })
        .expect(401);

      expect(response.body).toMatchObject({
        type: 'urn:qpp:error:http-401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Invalid CSRF token',
        instance: '/runs',
      });
    });
  });
});
