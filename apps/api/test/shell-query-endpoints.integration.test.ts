/**
 * Shell Query Endpoints Integration Tests
 *
 * Goals:
 * - Use real AppModule wiring (no internal service mocking)
 * - Assert observable behavior via HTTP responses
 * - For AppError scenarios, assert on ErrorCode (not just status/message)
 */
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@qpp/backend-shared';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
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
  // eslint-disable-next-line security/detect-object-injection -- `key` is a trusted string literal in tests
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test-shell-query-endpoints-tssd';
const TEST_SF_USER_ID = 'sf-shell-query-endpoints-user';
const TEST_EID = 'eid-shell-query-endpoints';
const TEST_MID = 'mid-shell-query-endpoints';

const server = setupServer(
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'shell-query-endpoints-access-token',
      refresh_token: 'shell-query-endpoints-refresh-token',
      expires_in: 3600,
      rest_instance_url: `https://${TEST_TSSD}.rest.marketingcloudapis.com`,
      soap_instance_url: `https://${TEST_TSSD}.soap.marketingcloudapis.com`,
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get(
    `https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/userinfo`,
    () => {
      return HttpResponse.json({
        sub: TEST_SF_USER_ID,
        enterprise_id: TEST_EID,
        member_id: TEST_MID,
        email: 'shell-query-endpoints@example.com',
        name: 'Shell Query Endpoints Test User',
      });
    },
  ),
);

describe('Shell query endpoints (integration)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;

  let csrfToken: string;
  let tenantId: string;
  let userId: string;
  let cookie: string;

  const createdRunIds: string[] = [];

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

    sqlClient = app.get<Sql>('SQL_CLIENT');
  }, 60000);

  afterAll(async () => {
    server.close();

    // Best-effort cleanup using proper RLS context
    if (tenantId && userId) {
      for (const runId of createdRunIds) {
        try {
          const reserved = await sqlClient.reserve();
          try {
            await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false), set_config('app.mid', ${TEST_MID}, false), set_config('app.user_id', ${userId}, false)`;
            await reserved`DELETE FROM shell_query_runs WHERE id = ${runId}::uuid`;
          } finally {
            reserved.release();
          }
        } catch {
          // ignore
        }
      }
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: TEST_SF_USER_ID,
      enterprise_id: TEST_EID,
      member_id: TEST_MID,
      stack: TEST_TSSD,
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { jwt },
    });
    expect(loginRes.statusCode).toBe(302);

    const setCookieHeader = loginRes.headers['set-cookie'];
    const setCookieValue = Array.isArray(setCookieHeader)
      ? setCookieHeader[0]
      : setCookieHeader;
    const cookiePart = setCookieValue?.split(';')[0];
    if (!cookiePart) {
      throw new Error('Missing session cookie from /auth/login');
    }
    cookie = cookiePart;

    const meResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });
    expect(meResponse.statusCode).toBe(200);

    const meJson = meResponse.json();
    csrfToken = meJson.csrfToken;
    tenantId = meJson.tenant?.id;
    userId = meJson.user?.id;

    expect(typeof csrfToken).toBe('string');
    expect(typeof tenantId).toBe('string');
    expect(typeof userId).toBe('string');
  });

  afterEach(() => {
    server.resetHandlers();
  });

  async function insertRun(
    status: 'queued' | 'running' | 'ready',
  ): Promise<string> {
    const runId = crypto.randomUUID();
    createdRunIds.push(runId);

    const sqlTextHash = crypto.randomUUID().replace(/-/g, '');

    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
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
          ${TEST_MID},
          ${status},
          ${sqlTextHash},
          'Shell Query Endpoints Test',
          NOW(),
          ${status === 'queued' ? null : new Date().toISOString()}::timestamptz,
          ${status === 'ready' ? new Date().toISOString() : null}::timestamptz,
          NULL
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

  it('returns 400 for missing sqlText', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().type).toBe('urn:qpp:error:http-400');
    expect(res.json().status).toBe(400);
  });

  it('returns 400 for sqlText exceeding max length', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { sqlText: 'x'.repeat(100_001) },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().type).toBe('urn:qpp:error:http-400');
    expect(res.json().status).toBe(400);
  });

  it('returns RESOURCE_NOT_FOUND for unknown run results', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/runs/${crypto.randomUUID()}/results?page=1`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().type).toBe('urn:qpp:error:resource-not-found');
    expect(res.json().code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });

  it('returns INVALID_STATE for results when run is not ready', async () => {
    const runId = await insertRun('running');

    const res = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/results?page=1`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().type).toBe('urn:qpp:error:invalid-state');
    expect(res.json().code).toBe(ErrorCode.INVALID_STATE);
  });

  it('returns RESOURCE_NOT_FOUND for unknown SSE run events', async () => {
    // Ensure this runId does not exist, otherwise Nest will attempt to start an
    // SSE stream (which isn't supported by Fastify inject in this test harness).
    const unknownRunId = crypto.randomUUID();
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
      await reserved`DELETE FROM shell_query_runs WHERE id = ${unknownRunId}::uuid`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
    } finally {
      reserved.release();
    }

    const res = await app.inject({
      method: 'GET',
      url: `/runs/${unknownRunId}/events`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().type).toBe('urn:qpp:error:resource-not-found');
    expect(res.json().code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
  });

  it('returns RATE_LIMIT_EXCEEDED when user has 10 active runs', async () => {
    for (let i = 0; i < 10; i++) {
      await insertRun('running');
    }

    const res = await app.inject({
      method: 'POST',
      url: '/runs',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { sqlText: 'SELECT 1' },
    });

    expect(res.statusCode).toBe(429);
    expect(res.json().type).toBe('urn:qpp:error:rate-limit-exceeded');
    expect(res.json().code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
  });

  it('returns MCE_SERVER_ERROR when MCE API returns 5xx during results fetch', async () => {
    const runId = await insertRun('ready');

    server.use(
      http.get(
        `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:deName/rowset`,
        () => {
          return HttpResponse.json(
            { message: 'Internal Server Error' },
            { status: 500 },
          );
        },
      ),
    );

    const res = await app.inject({
      method: 'GET',
      url: `/runs/${runId}/results?page=1`,
      headers: { cookie },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().type).toBe('urn:qpp:error:mce-server-error');
    expect(res.json().code).toBe(ErrorCode.MCE_SERVER_ERROR);
  });

  describe('run-to-target feature flag', () => {
    async function enableRunToTargetDE() {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`
          INSERT INTO tenant_feature_overrides (tenant_id, feature_key, enabled)
          VALUES (${tenantId}::uuid, ${'runToTargetDE'}, ${true})
          ON CONFLICT (tenant_id, feature_key) DO UPDATE SET enabled = ${true}
        `;
        await reserved`RESET app.tenant_id`;
      } finally {
        reserved.release();
      }
    }

    async function disableRunToTargetDE() {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`
          DELETE FROM tenant_feature_overrides
          WHERE tenant_id = ${tenantId}::uuid AND feature_key = ${'runToTargetDE'}
        `;
        await reserved`RESET app.tenant_id`;
      } finally {
        reserved.release();
      }
    }

    async function cleanupActiveRuns() {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
        await reserved`
          DELETE FROM shell_query_runs
          WHERE tenant_id = ${tenantId}::uuid
            AND user_id = ${userId}::uuid
            AND status IN ('queued', 'running')
        `;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
      } finally {
        reserved.release();
      }
    }

    beforeEach(async () => {
      await cleanupActiveRuns();
    });

    afterEach(async () => {
      await disableRunToTargetDE();
    });

    it('returns 201 when targetDeCustomerKey provided and feature enabled', async () => {
      await enableRunToTargetDE();

      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: {
          sqlText: 'SELECT 1',
          targetDeCustomerKey: 'MyTargetDE',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = res.json();
      expect(json.runId).toBeDefined();
      expect(json.status).toBe('queued');

      createdRunIds.push(json.runId);
    });

    it('returns FEATURE_NOT_ENABLED when targetDeCustomerKey provided and feature disabled', async () => {
      await disableRunToTargetDE();

      const res = await app.inject({
        method: 'POST',
        url: '/runs',
        headers: { cookie, 'x-csrf-token': csrfToken },
        payload: {
          sqlText: 'SELECT 1',
          targetDeCustomerKey: 'MyTargetDE',
        },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().type).toBe('urn:qpp:error:feature-not-enabled');
      expect(res.json().code).toBe(ErrorCode.FEATURE_NOT_ENABLED);
    });
  });
});
