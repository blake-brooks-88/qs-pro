import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
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

/**
 * SessionGuard E2E Tests
 *
 * CRITICAL: These tests prove that SessionGuard ACTUALLY rejects unauthenticated requests.
 *
 * Why this matters:
 * - All existing shell-query tests MOCK SessionGuard
 * - We have zero proof that unauthenticated requests are rejected in production
 * - This test uses REAL SessionGuard execution (no mocking)
 *
 * Each test uses a FRESH supertest request (no cookie jar sharing).
 * We do NOT authenticate - the point is testing REJECTION.
 */

describe('Session Guard (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
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
    await app.close();
  });

  describe('Protected Endpoints Rejection', () => {
    it('should reject GET /auth/me without session with 401', async () => {
      // Fresh request - no session cookies
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);

      // RFC 9457 ProblemDetails format
      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
      expect(response.body.title).toBe('Unauthorized');
    });

    it('should reject POST /runs without session with 401', async () => {
      // Fresh request - no session cookies
      const response = await request(app.getHttpServer())
        .post('/runs')
        .send({ sqlText: 'SELECT * FROM test' })
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /runs/:runId without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/runs/any-run-id')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /runs/:runId/events (SSE) without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/runs/any-run-id/events')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject POST /runs/:runId/cancel without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/runs/any-run-id/cancel')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /runs/:runId/results without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/runs/any-run-id/results')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /metadata/folders without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/metadata/folders')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /metadata/data-extensions without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/metadata/data-extensions')
        .query({ eid: 'test-eid' })
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /metadata/fields without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/metadata/fields')
        .query({ key: 'test-key' })
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });

    it('should reject GET /auth/refresh without session with 401', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/refresh')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.status).toBe(401);
    });
  });

  describe('Public Endpoints Access', () => {
    it('should allow GET /livez without session', async () => {
      const response = await request(app.getHttpServer())
        .get('/livez')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });

    it('should allow GET / without session', async () => {
      const response = await request(app.getHttpServer()).get('/').expect(200);

      expect(response.text).toBe('Hello World!');
    });

    it('should allow GET /auth/login without session (redirects to OAuth)', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/login')
        .query({ tssd: 'test-tssd' })
        .expect(302);

      // Should redirect to OAuth authorize URL
      expect(response.headers.location).toContain('authorize');
    });

    it('should allow POST /auth/login without session (accepts JWT)', async () => {
      // This will fail with 401 because JWT is invalid, but that's EXPECTED
      // The point is that SessionGuard does NOT block this endpoint
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ jwt: 'invalid-jwt' })
        .expect(401);

      // Error should be about JWT (authentication failed), not about session (not authenticated)
      // The RFC 9457 format uses 'detail' field
      expect(response.body.detail).toContain('Authentication failed');
    });

    it('should allow GET /auth/logout without session', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/logout')
        .expect(200);

      // Logout should succeed even without session
      expect(response.body.ok).toBe(true);
    });

    it('should allow GET /auth/callback without session (will fail state validation)', async () => {
      // This will fail with 401 because state validation fails, but that's EXPECTED
      // The point is that SessionGuard does NOT block this endpoint
      const response = await request(app.getHttpServer())
        .get('/auth/callback')
        .query({ code: 'test-code', state: 'test-state' })
        .expect(401);

      // Error should be about state, not about session
      // The RFC 9457 format uses 'detail' field
      expect(response.body.detail).toContain('OAuth state');
    });
  });

  describe('Error Response Format', () => {
    it('should return RFC 9457 compliant error response', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);

      // Verify RFC 9457 ProblemDetails format
      expect(response.body).toMatchObject({
        type: 'urn:qpp:error:http-401',
        title: 'Unauthorized',
        status: 401,
        detail: 'Not authenticated',
        instance: '/auth/me',
      });
    });
  });
});
