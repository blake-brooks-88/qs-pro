/**
 * ShellQueryService Integration Tests
 *
 * This integration test replaces:
 * - shell-query.service.unit.test.ts (deleted - mock-heavy)
 * - shell-query.controller.unit.test.ts (deleted - mock-heavy)
 *
 * Test Strategy:
 * - Real NestJS app with full AppModule (not just ShellQueryModule)
 * - Real PostgreSQL database with RLS context
 * - Real BullMQ queue (connects to Redis)
 * - MSW for MCE HTTP only (external API)
 * - No internal service mocking - behavioral assertions on DB state and queue jobs
 *
 * Controller behavior is tested via HTTP in E2E tests (query-execution-flow.e2e.test.ts).
 * Service behavior is tested here with real infrastructure.
 */
import { getQueueToken } from '@nestjs/bullmq';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, ErrorCode } from '@qpp/backend-shared';
import { externalOnlyOnUnhandledRequest } from '@qpp/test-utils';
import { Queue } from 'bullmq';
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

import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { ShellQueryService } from '../shell-query.service';

function getRequiredEnv(key: string): string {
  // eslint-disable-next-line security/detect-object-injection -- trusted string
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing env: ${key}`);
  }
  return value;
}

const TEST_TSSD = 'test-shell-query-int';

// MSW handlers for auth endpoints
const defaultHandlers = [
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'shell-query-int-access-token',
      refresh_token: 'shell-query-int-refresh-token',
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
        sub: 'sf-shell-query-int',
        enterprise_id: 'eid-shell-query-int',
        member_id: 'mid-shell-query-int',
        email: 'shell-query-int@example.com',
        name: 'Shell Query Integration User',
      });
    },
  ),
  // REST: Get rowset (results) - for getResults tests
  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset`,
    () => {
      return HttpResponse.json({
        items: [
          {
            keys: { _CustomObjectKey: '1' },
            values: { Name: 'Test User', Email: 'test@test.com' },
          },
        ],
        count: 1,
        page: 1,
        pageSize: 50,
      });
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('ShellQueryService (integration)', () => {
  let app: NestFastifyApplication;
  let service: ShellQueryService;
  let sqlClient: Sql;
  let shellQueryQueue: Queue;
  let encryptionService: EncryptionService;

  // Test data
  let testTenantId: string;
  let testUserId: string;
  const testMid = 'mid-shell-query-int';
  const testEid = 'eid-shell-query-int';
  const testAccessToken = 'test-access-token';

  // Track created runs for cleanup
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
    service = app.get(ShellQueryService);
    shellQueryQueue = app.get<Queue>(getQueueToken('shell-query'));
    encryptionService = app.get(EncryptionService);

    // Create test tenant and user directly in DB
    const tenantResult =
      await sqlClient`INSERT INTO tenants (eid, tssd) VALUES (${testEid}, ${TEST_TSSD}) RETURNING id`;
    const tenantRow = tenantResult[0];
    if (!tenantRow) {
      throw new Error('Failed to insert test tenant');
    }
    testTenantId = tenantRow.id;

    const userResult = await sqlClient`
      INSERT INTO users (sf_user_id, tenant_id, email, name)
      VALUES ('sf-shell-query-int', ${testTenantId}, 'shell-query-int@example.com', 'Integration Test User')
      RETURNING id
    `;
    const userRow = userResult[0];
    if (!userRow) {
      throw new Error('Failed to insert test user');
    }
    testUserId = userRow.id;

    // Seed credentials so REST requests can authenticate without refresh.
    const encryptedAccessToken = encryptionService.encrypt(testAccessToken);
    const encryptedRefreshToken = encryptionService.encrypt(
      'shell-query-int-refresh-token',
    );
    if (!encryptedAccessToken || !encryptedRefreshToken) {
      throw new Error('Failed to encrypt MCE credentials for test setup');
    }
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
      await reserved`
        INSERT INTO credentials (tenant_id, user_id, mid, access_token, refresh_token, expires_at)
        VALUES (
          ${testTenantId}::uuid,
          ${testUserId}::uuid,
          ${testMid},
          ${encryptedAccessToken},
          ${encryptedRefreshToken},
          ${new Date(Date.now() + 60 * 60 * 1000).toISOString()}
        )
      `;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
    } finally {
      reserved.release();
    }
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up test runs using reserved connection with RLS context
    for (const runId of createdRunIds) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`DELETE FROM shell_query_runs WHERE id = ${runId}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Best effort cleanup
      }
    }

    // Clean up user and tenant (not RLS-protected)
    try {
      const reserved = await sqlClient.reserve();
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
      await reserved`DELETE FROM credentials WHERE user_id = ${testUserId}::uuid`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    } catch {
      // Best effort cleanup
    }

    if (testUserId) {
      await sqlClient`DELETE FROM users WHERE id = ${testUserId}::uuid`;
    }
    if (testTenantId) {
      await sqlClient`ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_delete`;
      await sqlClient`DELETE FROM tenants WHERE id = ${testTenantId}::uuid`;
      await sqlClient`ALTER TABLE audit_logs ENABLE TRIGGER audit_logs_no_delete`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    server.resetHandlers();
    // Drain queue before each test
    try {
      await shellQueryQueue.drain();
    } catch {
      // Ignore drain errors
    }
  });

  afterEach(async () => {
    // Clean up jobs created during test
    try {
      await shellQueryQueue.drain();
    } catch {
      // Ignore
    }
  });

  /**
   * Helper to create the service context for tests.
   */
  function createServiceContext() {
    return {
      tenantId: testTenantId,
      userId: testUserId,
      mid: testMid,
      eid: testEid,
      accessToken: testAccessToken,
    };
  }

  /**
   * Helper to query run from database with proper RLS context.
   * Uses reserved connection to maintain RLS context.
   */
  async function getRunFromDb(runId: string) {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;

      const result = await reserved`
        SELECT * FROM shell_query_runs WHERE id = ${runId}::uuid
      `;

      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;

      return result[0] ?? null;
    } finally {
      reserved.release();
    }
  }

  /**
   * Helper to create a run directly in DB with specific status.
   * Uses reserved connection to maintain RLS context.
   */
  async function createRunInDb(
    status: 'queued' | 'running' | 'ready' | 'failed' | 'canceled',
    options: {
      errorMessage?: string;
      snippetName?: string;
      targetDeCustomerKey?: string;
    } = {},
  ): Promise<string> {
    const runId = crypto.randomUUID();
    createdRunIds.push(runId);

    const sqlTextHash = crypto.randomUUID().replace(/-/g, '');
    const startedAt = status !== 'queued' ? new Date().toISOString() : null;
    const completedAt = ['ready', 'failed', 'canceled'].includes(status)
      ? new Date().toISOString()
      : null;

    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;

      await reserved`
        INSERT INTO shell_query_runs (
          id, tenant_id, user_id, mid, status, sql_text_hash, snippet_name,
          target_de_customer_key, created_at, started_at, completed_at, error_message
        )
        VALUES (
          ${runId}::uuid,
          ${testTenantId}::uuid,
          ${testUserId}::uuid,
          ${testMid},
          ${status},
          ${sqlTextHash},
          ${options.snippetName ?? 'Test Query'},
          ${options.targetDeCustomerKey ?? null},
          NOW(),
          ${startedAt}::timestamptz,
          ${completedAt}::timestamptz,
          ${options.errorMessage ?? null}
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
   * Helper to create a run with targetDeCustomerKey in DB.
   */
  async function createRunInDbWithTargetDe(
    status: 'queued' | 'running' | 'ready' | 'failed' | 'canceled',
    targetDeCustomerKey: string,
  ): Promise<string> {
    return createRunInDb(status, { targetDeCustomerKey });
  }

  describe('createRun', () => {
    it('should create run record in database', async () => {
      const context = createServiceContext();
      const sqlText = 'SELECT Name, Email FROM TestDE';
      const snippetName = 'Integration Test Query';

      const runId = await service.createRun(context, sqlText, snippetName);
      createdRunIds.push(runId);

      // Verify database record exists
      const dbRun = await getRunFromDb(runId);
      expect(dbRun).not.toBeNull();
      if (!dbRun) {
        throw new Error('Expected run to exist in database');
      }
      expect(dbRun.id).toBe(runId);
      expect(dbRun.tenant_id).toBe(testTenantId);
      expect(dbRun.user_id).toBe(testUserId);
      expect(dbRun.mid).toBe(testMid);
      expect(dbRun.snippet_name).toBe(snippetName);
      expect(dbRun.status).toBe('queued');
      expect(dbRun.created_at).toBeDefined();
    });

    it('should enqueue job to BullMQ with correct payload', async () => {
      const context = createServiceContext();
      const sqlText = 'SELECT Id FROM Subscribers';
      const snippetName = 'BullMQ Test';

      const runId = await service.createRun(context, sqlText, snippetName);
      createdRunIds.push(runId);

      const job = await shellQueryQueue.getJob(runId);

      expect(job).toBeDefined();
      expect(job?.data.tenantId).toBe(testTenantId);
      expect(job?.data.userId).toBe(testUserId);
      expect(job?.data.mid).toBe(testMid);
      expect(job?.data.eid).toBe(testEid);
      expect(job?.data.snippetName).toBe(snippetName);
      // sqlText should be encrypted (not plaintext)
      expect(job?.data.sqlText).not.toBe(sqlText);
    });

    it('should set BullMQ job options (retries, backoff, retention, jobId)', async () => {
      const context = createServiceContext();

      const runId = await service.createRun(
        context,
        'SELECT * FROM _Subscribers',
        'Job Opts Test',
      );
      createdRunIds.push(runId);

      const job = await shellQueryQueue.getJob(runId);

      expect(job).toBeDefined();
      expect(job?.id).toBe(runId);
      expect(job?.opts.attempts).toBe(2);
      expect(job?.opts.backoff).toEqual({ type: 'exponential', delay: 5000 });
      expect(job?.opts.removeOnComplete).toEqual({ age: 3600 });
      expect(job?.opts.removeOnFail).toEqual({ age: 86400 });
    });

    it('should truncate snippetName to 100 characters', async () => {
      const context = createServiceContext();
      const longSnippetName = 'a'.repeat(150);

      const runId = await service.createRun(
        context,
        'SELECT 1',
        longSnippetName,
      );
      createdRunIds.push(runId);

      const dbRun = await getRunFromDb(runId);
      expect(dbRun).not.toBeNull();
      if (!dbRun) {
        throw new Error('Expected run to exist in database');
      }
      expect(dbRun.snippet_name).toBe(longSnippetName.slice(0, 100));

      const job = await shellQueryQueue.getJob(runId);
      expect(job?.data.snippetName).toBe(longSnippetName.slice(0, 100));
    });

    it('should encrypt sqlText before queuing', async () => {
      const context = createServiceContext();
      const sqlText = 'SELECT SensitiveField FROM PrivateDE';

      const runId = await service.createRun(context, sqlText);
      createdRunIds.push(runId);

      const job = await shellQueryQueue.getJob(runId);

      // Verify sqlText is encrypted (not plaintext)
      expect(job?.data.sqlText).not.toBe(sqlText);

      // Verify we can decrypt it back
      const decrypted = encryptionService.decrypt(job?.data.sqlText);
      expect(decrypted).toBe(sqlText);
    });

    it('should enforce per-user rate limit (10 concurrent runs)', async () => {
      const context = createServiceContext();

      // Create 10 runs to hit the limit
      const runIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const runId = await createRunInDb('running');
        runIds.push(runId);
      }

      // 11th run should fail with rate limit
      await expect(
        service.createRun(context, 'SELECT * FROM RateLimitTest'),
      ).rejects.toMatchObject({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
      });

      // Clean up the 10 runs we created
      for (const runId of runIds) {
        try {
          const reserved = await sqlClient.reserve();
          await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
          await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
          await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
          await reserved`DELETE FROM shell_query_runs WHERE id = ${runId}::uuid`;
          await reserved`RESET app.tenant_id`;
          await reserved`RESET app.mid`;
          await reserved`RESET app.user_id`;
          reserved.release();
        } catch {
          // Ignore
        }
      }
      // Remove from tracking since we already cleaned
      runIds.forEach((id) => {
        const idx = createdRunIds.indexOf(id);
        if (idx > -1) {
          createdRunIds.splice(idx, 1);
        }
      });
    });

    it('should generate unique run IDs', async () => {
      const context = createServiceContext();

      const runId1 = await service.createRun(context, 'SELECT 1');
      const runId2 = await service.createRun(context, 'SELECT 2');
      createdRunIds.push(runId1, runId2);

      expect(runId1).not.toBe(runId2);
      expect(runId1).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(runId2).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should compute and store SQL text hash', async () => {
      const context = createServiceContext();
      const sqlText = 'SELECT HashTest FROM TestDE';

      const runId = await service.createRun(context, sqlText);
      createdRunIds.push(runId);

      const dbRun = await getRunFromDb(runId);
      expect(dbRun).not.toBeNull();
      if (!dbRun) {
        throw new Error('Expected run to exist in database');
      }
      expect(dbRun.sql_text_hash).toBeDefined();
      expect(dbRun.sql_text_hash).toHaveLength(64); // SHA-256 hex
    });
  });

  describe('getRun', () => {
    it('should return run by ID', async () => {
      const runId = await createRunInDb('queued', {
        snippetName: 'GetRun Test',
      });

      const run = await service.getRun(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(run).not.toBeNull();
      expect(run?.id).toBe(runId);
      expect(run?.snippetName).toBe('GetRun Test');
      expect(run?.status).toBe('queued');
    });

    it('should return null for non-existent run', async () => {
      const fakeRunId = crypto.randomUUID();

      const run = await service.getRun(
        fakeRunId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(run).toBeNull();
    });

    it('should enforce RLS - not return other tenant runs', async () => {
      // Create a run with our test tenant
      const runId = await createRunInDb('queued');

      // Try to access with different tenant ID
      const otherTenantId = crypto.randomUUID();
      const run = await service.getRun(
        runId,
        otherTenantId,
        testMid,
        testUserId,
      );

      // RLS should prevent access
      expect(run).toBeNull();
    });

    it('should enforce RLS - not return other user runs', async () => {
      const runId = await createRunInDb('queued');

      // Try to access with different user ID
      const otherUserId = crypto.randomUUID();
      const run = await service.getRun(
        runId,
        testTenantId,
        testMid,
        otherUserId,
      );

      // RLS should prevent access
      expect(run).toBeNull();
    });
  });

  describe('getRunStatus', () => {
    it('should return status response with timestamps', async () => {
      const runId = await createRunInDb('queued');

      const status = await service.getRunStatus(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(status.runId).toBe(runId);
      expect(status.status).toBe('queued');
      expect(status.createdAt).toBeInstanceOf(Date);
      expect(status.updatedAt).toBeInstanceOf(Date);
    });

    it('should set updatedAt based on run state (completedAt ?? startedAt ?? createdAt)', async () => {
      const queuedId = await createRunInDb('queued');
      const queuedStatus = await service.getRunStatus(
        queuedId,
        testTenantId,
        testMid,
        testUserId,
      );
      expect(queuedStatus.updatedAt.getTime()).toBe(
        queuedStatus.createdAt.getTime(),
      );

      const runningId = await createRunInDb('running');
      const runningRun = await service.getRun(
        runningId,
        testTenantId,
        testMid,
        testUserId,
      );
      if (!runningRun?.startedAt) {
        throw new Error('runningRun.startedAt missing');
      }
      const runningStatus = await service.getRunStatus(
        runningId,
        testTenantId,
        testMid,
        testUserId,
      );
      expect(runningStatus.updatedAt.getTime()).toBe(
        runningRun.startedAt.getTime(),
      );

      const readyId = await createRunInDb('ready');
      const readyRun = await service.getRun(
        readyId,
        testTenantId,
        testMid,
        testUserId,
      );
      if (!readyRun?.completedAt) {
        throw new Error('readyRun.completedAt missing');
      }
      const readyStatus = await service.getRunStatus(
        readyId,
        testTenantId,
        testMid,
        testUserId,
      );
      expect(readyStatus.updatedAt.getTime()).toBe(
        readyRun.completedAt.getTime(),
      );
    });

    it('should decrypt errorMessage for failed runs', async () => {
      const errorMessage = 'Test error: invalid column reference';
      const encryptedError = encryptionService.encrypt(errorMessage);

      const runId = await createRunInDb('failed', {
        errorMessage: encryptedError ?? undefined,
      });

      const status = await service.getRunStatus(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(status.status).toBe('failed');
      expect(status.errorMessage).toBe(errorMessage);
    });

    it('should throw RESOURCE_NOT_FOUND for non-existent run', async () => {
      const fakeRunId = crypto.randomUUID();

      await expect(
        service.getRunStatus(fakeRunId, testTenantId, testMid, testUserId),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('cancelRun', () => {
    it('should update status to canceled in database', async () => {
      const runId = await createRunInDb('running');

      const result = await service.cancelRun(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(result.status).toBe('canceled');
      expect(result.runId).toBe(runId);

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun).not.toBeNull();
      if (!dbRun) {
        throw new Error('Expected run to exist in database');
      }
      expect(dbRun.status).toBe('canceled');
      expect(dbRun.completed_at).not.toBeNull();
    });

    it('should cancel queued run', async () => {
      const runId = await createRunInDb('queued');

      const result = await service.cancelRun(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(result.status).toBe('canceled');

      const dbRun = await getRunFromDb(runId);
      expect(dbRun).not.toBeNull();
      if (!dbRun) {
        throw new Error('Expected run to exist in database');
      }
      expect(dbRun.status).toBe('canceled');
    });

    it('should return existing status for already completed run', async () => {
      const runId = await createRunInDb('ready');

      const result = await service.cancelRun(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(result.status).toBe('ready');
      expect(result.message).toBe('Run already completed or canceled');
    });

    it('should return existing status for already failed run', async () => {
      const runId = await createRunInDb('failed');

      const result = await service.cancelRun(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(result.status).toBe('failed');
      expect(result.message).toBe('Run already completed or canceled');
    });

    it('should return existing status for already canceled run', async () => {
      const runId = await createRunInDb('canceled');

      const result = await service.cancelRun(
        runId,
        testTenantId,
        testMid,
        testUserId,
      );

      expect(result.status).toBe('canceled');
      expect(result.message).toBe('Run already completed or canceled');
    });

    it('should throw RESOURCE_NOT_FOUND for non-existent run', async () => {
      const fakeRunId = crypto.randomUUID();

      await expect(
        service.cancelRun(fakeRunId, testTenantId, testMid, testUserId),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('getResults', () => {
    it('should throw RESOURCE_NOT_FOUND for non-existent run', async () => {
      const fakeRunId = crypto.randomUUID();

      await expect(
        service.getResults(fakeRunId, testTenantId, testUserId, testMid, 1),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('should throw INVALID_STATE for not-ready run', async () => {
      const runId = await createRunInDb('running');

      await expect(
        service.getResults(runId, testTenantId, testUserId, testMid, 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
      });
    });

    it('should proxy to MCE REST rowset API and normalize results', async () => {
      let requestedKey: string | null = null;

      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset`,
          ({ params }) => {
            requestedKey = String(params.key);
            return HttpResponse.json({
              items: [
                {
                  keys: { _CustomObjectKey: '1' },
                  values: { Name: 'Test User', Email: 'test@test.com' },
                },
              ],
              count: 1,
              page: 1,
              pageSize: 50,
            });
          },
        ),
      );

      const snippetName = 'My Results Query';
      const runId = await createRunInDb('ready', { snippetName });

      const results = await service.getResults(
        runId,
        testTenantId,
        testUserId,
        testMid,
        1,
      );

      expect(requestedKey).toBe(
        `QPP_${snippetName.replace(/\s+/g, '_')}_${runId.slice(0, 8)}`,
      );
      expect(results.columns).toEqual(
        expect.arrayContaining(['_CustomObjectKey', 'Name', 'Email']),
      );
      expect(results.rows).toEqual([
        { _CustomObjectKey: '1', Name: 'Test User', Email: 'test@test.com' },
      ]);
      expect(results.totalRows).toBe(1);
      expect(results.page).toBe(1);
      expect(results.pageSize).toBe(50);
    });

    it('should throw INVALID_STATE with error for failed run', async () => {
      const errorMessage = 'Query execution failed';
      const encryptedError = encryptionService.encrypt(errorMessage);

      const runId = await createRunInDb('failed', {
        errorMessage: encryptedError ?? undefined,
      });

      await expect(
        service.getResults(runId, testTenantId, testUserId, testMid, 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
        context: {
          status: 'failed',
          statusMessage: errorMessage,
        },
      });
    });

    it('should use targetDeCustomerKey for MCE rowset request', async () => {
      const targetDeKey = 'My_Custom_Target_DE';
      let requestedKey: string | null = null;

      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset`,
          ({ params }) => {
            requestedKey = String(params.key);
            return HttpResponse.json({
              items: [
                {
                  keys: { _CustomObjectKey: '1' },
                  values: { Name: 'Target User' },
                },
              ],
              count: 1,
              page: 1,
              pageSize: 50,
            });
          },
        ),
      );

      const runId = await createRunInDbWithTargetDe('ready', targetDeKey);

      await service.getResults(runId, testTenantId, testUserId, testMid, 1);

      expect(requestedKey).toBe(targetDeKey);
    });
  });

  describe('createRun (targetDeCustomerKey)', () => {
    async function cleanupActiveRuns() {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${testTenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${testMid}, false)`;
        await reserved`SELECT set_config('app.user_id', ${testUserId}, false)`;
        await reserved`
          DELETE FROM shell_query_runs
          WHERE tenant_id = ${testTenantId}::uuid
            AND user_id = ${testUserId}::uuid
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

    it('should persist targetDeCustomerKey to database', async () => {
      const context = createServiceContext();
      const sqlText = 'SELECT Name FROM TargetDE';
      const targetDeKey = 'My_Target_DE_Key';

      const runId = await service.createRun(
        context,
        sqlText,
        'Target DE Test',
        undefined,
        targetDeKey,
      );
      createdRunIds.push(runId);

      const dbRun = await getRunFromDb(runId);
      expect(dbRun).not.toBeNull();
      if (!dbRun) {
        throw new Error('Expected run to exist in database');
      }
      expect(dbRun.target_de_customer_key).toBe(targetDeKey);
    });
  });
});
