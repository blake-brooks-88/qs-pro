/**
 * Cancel Endpoint Integration Tests
 *
 * Tests for POST /runs/:runId/cancel endpoint behavior.
 *
 * Test Strategy:
 * - Real NestJS app with FastifyAdapter
 * - Real PostgreSQL database (RLS-enabled)
 * - MSW for MCE API mocking
 * - No internal service mocking - behavioral assertions only
 *
 * Covered Scenarios:
 * - Cancel queued run -> returns { status: 'canceled', runId }
 * - Cancel running run -> returns { status: 'canceled', runId }
 * - Cancel already completed run -> returns { status: 'ready', message }
 * - Cancel already failed run -> returns { status: 'failed', message }
 * - Cancel already canceled run -> returns { status: 'canceled', message }
 * - Cancel non-existent run -> 404 RESOURCE_NOT_FOUND
 * - Cancel without authentication -> 401 Unauthorized
 * - Cancel without CSRF token -> 401 Unauthorized (tested in csrf-guard.e2e.test.ts)
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
import { Agent, agent as superagent } from 'supertest';
import request from 'supertest';
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
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test-cancel-endpoint-tssd';

// MSW handlers for auth endpoints
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'cancel-test-access-token',
      refresh_token: 'cancel-test-refresh-token',
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
        sub: 'cancel-test-user',
        enterprise_id: 'cancel-test-eid',
        member_id: 'cancel-test-mid',
        email: 'cancel-test@example.com',
        name: 'Cancel Test User',
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Cancel Endpoint (integration)', () => {
  let app: NestFastifyApplication;
  let authenticatedAgent: Agent;
  let csrfToken: string;
  let sqlClient: Sql;

  // Track created entities for cleanup
  let tenantId: string;
  let userId: string;
  const mid = 'cancel-test-mid';
  const createdRunIds: string[] = [];

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

    sqlClient = app.get<Sql>('SQL_CLIENT');
  });

  afterAll(async () => {
    server.close();

    // Clean up test data using reserved connection with RLS context
    if (createdRunIds.length > 0 && tenantId && userId) {
      for (const runId of createdRunIds) {
        try {
          const reserved = await sqlClient.reserve();
          await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
          await reserved`SELECT set_config('app.mid', ${mid}, false)`;
          await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
          await reserved`DELETE FROM shell_query_runs WHERE id = ${runId}::uuid`;
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
          await reserved`RESET app.user_id`;
          reserved.release();
        } catch {
          // Best effort cleanup
        }
      }
    }

    await app.close();
  });

  beforeEach(async () => {
    // Create authenticated agent for tests
    authenticatedAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: 'cancel-test-user',
      enterprise_id: 'cancel-test-eid',
      member_id: mid,
      stack: TEST_TSSD,
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    await authenticatedAgent.post('/auth/login').send({ jwt }).expect(302);

    const meResponse = await authenticatedAgent.get('/auth/me').expect(200);
    csrfToken = meResponse.body.csrfToken;
    tenantId = meResponse.body.tenant?.id;
    userId = meResponse.body.user?.id;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  /**
   * Helper function to create a run in the database with a specific status.
   * Uses a reserved connection with explicit RLS context for the INSERT.
   */
  async function createRunWithStatus(
    status: 'queued' | 'running' | 'ready' | 'failed' | 'canceled',
    errorMessage?: string,
  ): Promise<string> {
    const runId = crypto.randomUUID();
    createdRunIds.push(runId);

    const sqlTextHash = crypto.randomUUID().replace(/-/g, '');
    const startedAt = status !== 'queued' ? new Date().toISOString() : null;
    const completedAt = ['ready', 'failed', 'canceled'].includes(status)
      ? new Date().toISOString()
      : null;

    // Use reserved connection to maintain RLS context across statements
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;

      await reserved`
        INSERT INTO shell_query_runs (
          id, tenant_id, user_id, mid, status, sql_text_hash, snippet_name,
          created_at, started_at, completed_at, error_message
        )
        VALUES (
          ${runId}::uuid,
          ${tenantId}::uuid,
          ${userId}::uuid,
          ${mid},
          ${status},
          ${sqlTextHash},
          'Test Query',
          NOW(),
          ${startedAt}::timestamptz,
          ${completedAt}::timestamptz,
          ${errorMessage ?? null}
        )
      `;

      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
    } finally {
      reserved.release();
    }

    return runId;
  }

  /**
   * Helper function to query run status from database with proper RLS context.
   */
  async function getRunStatus(runId: string): Promise<string | null> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;

      const result = await reserved`
        SELECT status FROM shell_query_runs WHERE id = ${runId}::uuid
      `;

      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;

      return result[0]?.status ?? null;
    } finally {
      reserved.release();
    }
  }

  describe('Cancel Active Runs', () => {
    it('should cancel a queued run', async () => {
      const runId = await createRunWithStatus('queued');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response.body.status).toBe('canceled');
      expect(response.body.runId).toBe(runId);

      // Verify database state
      const dbStatus = await getRunStatus(runId);
      expect(dbStatus).toBe('canceled');
    });

    it('should cancel a running query', async () => {
      const runId = await createRunWithStatus('running');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response.body.status).toBe('canceled');
      expect(response.body.runId).toBe(runId);

      // Verify database state
      const dbStatus = await getRunStatus(runId);
      expect(dbStatus).toBe('canceled');
    });
  });

  describe('Cancel Completed Runs', () => {
    it('should return existing status for already completed run', async () => {
      const runId = await createRunWithStatus('ready');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response.body.status).toBe('ready');
      expect(response.body.message).toBe('Run already completed or canceled');
    });

    it('should return existing status for already failed run', async () => {
      const runId = await createRunWithStatus('failed', 'Test error message');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response.body.status).toBe('failed');
      expect(response.body.message).toBe('Run already completed or canceled');
    });

    it('should return existing status for already canceled run', async () => {
      const runId = await createRunWithStatus('canceled');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response.body.status).toBe('canceled');
      expect(response.body.message).toBe('Run already completed or canceled');
    });
  });

  describe('Error Cases', () => {
    it('should return 404 for non-existent run', async () => {
      const nonExistentId = crypto.randomUUID();

      const response = await authenticatedAgent
        .post(`/runs/${nonExistentId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(404);

      // AppError returns RFC 9457 ProblemDetails with type field
      expect(response.body.type).toBe('urn:qpp:error:resource-not-found');
      expect(response.body.title).toBe('Resource Not Found');
      expect(response.body.status).toBe(404);
    });

    it('should return 401 for unauthenticated request', async () => {
      const freshAgent = request(app.getHttpServer());

      const response = await freshAgent
        .post('/runs/any-run-id/cancel')
        .set('x-csrf-token', 'any-token')
        .expect(401);

      expect(response.body.detail).toBe('Not authenticated');
      expect(response.body.type).toBe('urn:qpp:error:http-401');
    });

    it('should return 401 for missing CSRF token', async () => {
      const runId = await createRunWithStatus('queued');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .expect(401);

      expect(response.body.detail).toBe('Missing CSRF token');
    });

    it('should return 401 for invalid CSRF token', async () => {
      const runId = await createRunWithStatus('queued');

      const response = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', 'invalid-csrf-token')
        .expect(401);

      expect(response.body.detail).toBe('Invalid CSRF token');
    });
  });

  describe('RLS Tenant Isolation', () => {
    it('should not allow canceling another tenant run', async () => {
      // Create run with current tenant
      const runId = await createRunWithStatus('queued');

      // Create a different authenticated agent with different tenant
      const otherAgent = superagent(app.getHttpServer());
      const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
      const encodedSecret = new TextEncoder().encode(secret);

      const otherPayload = {
        user_id: 'other-user-id',
        enterprise_id: 'other-eid',
        member_id: 'other-mid',
        stack: TEST_TSSD,
      };

      const otherJwt = await new jose.SignJWT(otherPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('1h')
        .sign(encodedSecret);

      await otherAgent.post('/auth/login').send({ jwt: otherJwt }).expect(302);

      const otherMeResponse = await otherAgent.get('/auth/me').expect(200);
      const otherCsrfToken = otherMeResponse.body.csrfToken;

      // Attempt to cancel run from another tenant
      const response = await otherAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', otherCsrfToken)
        .expect(404);

      // RLS should make the run invisible to other tenant
      expect(response.body.type).toBe('urn:qpp:error:resource-not-found');
      expect(response.body.status).toBe(404);
    });
  });

  describe('Idempotency', () => {
    it('should handle multiple cancel requests for same run', async () => {
      const runId = await createRunWithStatus('running');

      // First cancel - should mark as canceled
      const response1 = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response1.body.status).toBe('canceled');
      expect(response1.body.runId).toBe(runId);

      // Second cancel - should return existing canceled status
      const response2 = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response2.body.status).toBe('canceled');
      expect(response2.body.message).toBe('Run already completed or canceled');

      // Third cancel - still same result
      const response3 = await authenticatedAgent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(response3.body.status).toBe('canceled');
      expect(response3.body.message).toBe('Run already completed or canceled');
    });
  });
});
