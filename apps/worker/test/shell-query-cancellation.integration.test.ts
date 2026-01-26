/**
 * Shell Query Cancellation Integration Tests
 *
 * Tests the cancellation behavior of ShellQueryProcessor with real infrastructure.
 *
 * Test Strategy:
 * - Real NestJS TestingModule with individual providers (not ShellQueryModule)
 * - Real PostgreSQL database with RLS context
 * - Stub MceAuthProvider (provides TSSD for SOAP URL construction)
 * - MSW for MCE REST/SOAP requests (external boundary only)
 * - Behavioral assertions via database state and MSW request capture
 *
 * Covered Behaviors:
 * - Cancellation check before execute starts (poll job)
 * - Cleanup called when cancellation detected
 * - onFailed event handler performs cleanup
 */
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import {
  DatabaseModule,
  MCE_AUTH_PROVIDER,
  MceAuthProvider,
  MceModule,
  LoggerModule,
  validateWorkerEnv,
  EncryptionService,
  AsyncStatusService,
  RestDataService,
  MceBridgeService,
  RlsContextService,
} from '@qpp/backend-shared';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
import type { Job, Queue } from 'bullmq';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { MceQueryValidator } from '../src/shell-query/mce-query-validator';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import type { PollShellQueryJob, ShellQueryJob } from '../src/shell-query/shell-query.types';

const TEST_TSSD = 'cancel-test-tssd';
const TEST_TENANT_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_MID = `mid-cancel-test-${Date.now()}`;
const TEST_EID = `eid-cancel-test-${Date.now()}`;

const server = setupServer();

function createStubAuthProvider(): MceAuthProvider {
  return {
    refreshToken: async () => {
      return { accessToken: 'test-access-token', tssd: TEST_TSSD };
    },
    invalidateToken: async () => {
      // No-op for tests
    },
  };
}

// Helper to generate SOAP RetrieveResponse for QueryDefinition
function buildRetrieveResponse(objectId: string, customerKey: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <OverallStatus>OK</OverallStatus>
      <RequestID>test-request-id</RequestID>
      <Results xsi:type="QueryDefinition">
        <ObjectID>${objectId}</ObjectID>
        <CustomerKey>${customerKey}</CustomerKey>
        <Name>${customerKey}</Name>
      </Results>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
}

// Helper to generate empty SOAP RetrieveResponse
function buildEmptyRetrieveResponse(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <OverallStatus>OK</OverallStatus>
      <RequestID>test-request-id</RequestID>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
}

// Helper to generate SOAP DeleteResponse
function buildDeleteResponse(statusCode = 'OK'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <DeleteResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <Results>
        <StatusCode>${statusCode}</StatusCode>
        <StatusMessage>Success</StatusMessage>
      </Results>
    </DeleteResponse>
  </soap:Body>
</soap:Envelope>`;
}

// Helper to detect SOAP request type
function detectRequestType(body: string): 'Retrieve' | 'Delete' | 'Other' {
  if (body.includes('RetrieveRequest')) return 'Retrieve';
  if (body.includes('DeleteRequest')) return 'Delete';
  return 'Other';
}

// Stub metrics provider
function createMetricsStub() {
  return {
    inc: vi.fn(),
    dec: vi.fn(),
    observe: vi.fn(),
    labels: vi.fn().mockReturnThis(),
  };
}

describe('Shell Query Cancellation (integration)', () => {
  let module: TestingModule;
  let processor: ShellQueryProcessor;
  let sqlClient: Sql;
  let encryptionService: EncryptionService;
  let runId: string;

  async function insertCredentials(
    tenantId: string,
    userId: string,
    mid: string,
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`
        INSERT INTO credentials (tenant_id, user_id, mid, access_token, refresh_token, expires_at)
        VALUES (${tenantId}::uuid, ${userId}::uuid, ${mid}, ${accessToken}, ${refreshToken}, NOW() + INTERVAL '1 hour')
        ON CONFLICT (user_id, tenant_id, mid) DO UPDATE
        SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, expires_at = EXCLUDED.expires_at
      `;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    }
  }

  async function deleteCredentials(tenantId: string, mid: string): Promise<void> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`DELETE FROM credentials WHERE tenant_id = ${tenantId}::uuid AND mid = ${mid}`;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    }
  }

  async function createShellQueryRun(
    id: string,
    status: string,
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<void> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${tenantId}, false)`;
      await reserved`SELECT set_config('app.mid', ${mid}, false)`;
      await reserved`SELECT set_config('app.user_id', ${userId}, false)`;
      await reserved`
        INSERT INTO shell_query_runs (id, tenant_id, user_id, mid, status, sql_text_hash)
        VALUES (${id}::uuid, ${tenantId}::uuid, ${userId}::uuid, ${mid}, ${status}, 'hash_test')
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status
      `;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  }

  async function deleteShellQueryRun(id: string): Promise<void> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
      await reserved`DELETE FROM shell_query_runs WHERE id = ${id}::uuid`;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  }

  async function getRunStatus(id: string): Promise<string | null> {
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
      const result = await reserved`
        SELECT status FROM shell_query_runs WHERE id = ${id}::uuid
      `;
      return result[0]?.status ?? null;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }
  }

  function createMockPollJob(data: Partial<PollShellQueryJob>): Job<PollShellQueryJob> {
    const jobData: PollShellQueryJob = {
      runId: data.runId ?? runId,
      tenantId: data.tenantId ?? TEST_TENANT_ID,
      userId: data.userId ?? TEST_USER_ID,
      mid: data.mid ?? TEST_MID,
      taskId: data.taskId ?? 'task-123',
      queryDefinitionId: data.queryDefinitionId ?? '',
      queryCustomerKey: data.queryCustomerKey ?? `QPP_Query_${data.runId ?? runId}`,
      targetDeName: data.targetDeName ?? '',
      pollCount: data.pollCount ?? 0,
      pollStartedAt: data.pollStartedAt ?? new Date().toISOString(),
      notRunningConfirmations: data.notRunningConfirmations ?? 0,
    };

    return {
      id: `poll-${jobData.runId}`,
      name: 'poll-shell-query',
      data: jobData,
      opts: { attempts: 3 },
      attemptsMade: 1,
      updateData: vi.fn().mockResolvedValue(undefined),
      moveToDelayed: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<PollShellQueryJob>;
  }

  function createMockExecuteJob(data: Partial<ShellQueryJob>): Job<ShellQueryJob> {
    const encryptedSql = encryptionService.encrypt('SELECT 1') ?? '';
    const jobData: ShellQueryJob = {
      runId: data.runId ?? runId,
      tenantId: data.tenantId ?? TEST_TENANT_ID,
      userId: data.userId ?? TEST_USER_ID,
      mid: data.mid ?? TEST_MID,
      eid: data.eid ?? TEST_EID,
      sqlText: data.sqlText ?? encryptedSql,
    };

    return {
      id: `exec-${jobData.runId}`,
      name: 'execute-shell-query',
      data: jobData,
      opts: { attempts: 3 },
      attemptsMade: 3, // Final attempt for onFailed test
      updateData: vi.fn().mockResolvedValue(undefined),
      moveToDelayed: vi.fn().mockResolvedValue(undefined),
    } as unknown as Job<ShellQueryJob>;
  }

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });

    // Create a stub Queue that doesn't need real Redis for this test
    const mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'mock-job-id' }),
      getJob: vi.fn().mockResolvedValue(null),
      close: vi.fn().mockResolvedValue(undefined),
    };

    // Create a stub Redis client
    const mockRedis = {
      publish: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateWorkerEnv,
          envFilePath: '../../.env',
        }),
        LoggerModule,
        BullModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => ({
            connection: {
              url: configService.get<string>('REDIS_URL', 'redis://localhost:6379'),
            },
          }),
          inject: [ConfigService],
        }),
        ScheduleModule.forRoot(),
        DatabaseModule,
        MceModule,
      ],
      providers: [
        ShellQueryProcessor,
        RunToTempFlow,
        MceQueryValidator,
        { provide: getQueueToken('shell-query'), useValue: mockQueue },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: 'METRICS_JOBS_TOTAL', useValue: createMetricsStub() },
        { provide: 'METRICS_DURATION', useValue: createMetricsStub() },
        { provide: 'METRICS_FAILURES_TOTAL', useValue: createMetricsStub() },
        { provide: 'METRICS_ACTIVE_JOBS', useValue: createMetricsStub() },
      ],
    })
      .overrideProvider(MCE_AUTH_PROVIDER)
      .useValue(createStubAuthProvider())
      .compile();

    processor = module.get(ShellQueryProcessor);
    processor.setTestMode(true);
    sqlClient = module.get<Sql>('SQL_CLIENT');
    encryptionService = module.get(EncryptionService);

    // Create test tenant
    await sqlClient`
      INSERT INTO tenants (id, eid, tssd)
      VALUES (${TEST_TENANT_ID}::uuid, ${TEST_EID}, ${TEST_TSSD})
      ON CONFLICT (id) DO NOTHING
    `;

    // Create test user (sf_user_id must be unique)
    const sfUserId = `sf-cancel-test-${Date.now()}`;
    await sqlClient`
      INSERT INTO users (id, sf_user_id, tenant_id, email, name)
      VALUES (${TEST_USER_ID}::uuid, ${sfUserId}, ${TEST_TENANT_ID}::uuid, 'cancel@test.com', 'Cancel Test User')
      ON CONFLICT (id) DO NOTHING
    `;

    // Create credentials
    await insertCredentials(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, 'enc-access', 'enc-refresh');
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up test data with proper RLS context
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
      await reserved`DELETE FROM shell_query_runs WHERE tenant_id = ${TEST_TENANT_ID}::uuid`;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      await reserved`RESET app.user_id`;
      reserved.release();
    }

    try {
      await deleteCredentials(TEST_TENANT_ID, TEST_MID);
    } catch {
      // Ignore cleanup errors
    }
    await sqlClient`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
    await sqlClient`DELETE FROM tenants WHERE id = ${TEST_TENANT_ID}::uuid`;

    await module.close();
  }, 30000);

  beforeEach(async () => {
    server.resetHandlers();
    runId = crypto.randomUUID();
  });

  afterEach(async () => {
    server.resetHandlers();
    // Clean up any runs created during test
    try {
      await deleteShellQueryRun(runId);
    } catch {
      // Ignore if run doesn't exist
    }
  });

  describe('Cancellation detection in poll job', () => {
    it('should exit early when run status is canceled before poll starts', async () => {
      // Create a run with 'canceled' status in the database
      await createShellQueryRun(runId, 'canceled', TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      // Track cleanup attempts
      const deleteRequests: string[] = [];

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            const requestType = detectRequestType(body);

            if (requestType === 'Retrieve') {
              // Return a QueryDefinition for cleanup
              return HttpResponse.xml(buildRetrieveResponse('qd-cancel-test', `QPP_Query_${runId}`));
            }

            if (requestType === 'Delete') {
              deleteRequests.push(body);
              return HttpResponse.xml(buildDeleteResponse());
            }

            return HttpResponse.xml(buildEmptyRetrieveResponse());
          },
        ),
      );

      const job = createMockPollJob({
        runId,
        queryDefinitionId: '', // Force retrieve path
      });

      const result = await processor.process(job);

      // Should return canceled status
      expect(result).toEqual({ status: 'canceled', runId });

      // Run status in database should remain canceled
      const finalStatus = await getRunStatus(runId);
      expect(finalStatus).toBe('canceled');

      // Cleanup should have been attempted
      expect(deleteRequests.length).toBeGreaterThan(0);
    });

    it('should perform cleanup with existing queryDefinitionId when canceled', async () => {
      // Create a run with 'canceled' status
      await createShellQueryRun(runId, 'canceled', TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      const deleteRequests: string[] = [];
      const existingQdId = 'existing-qd-object-id';

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            const requestType = detectRequestType(body);

            if (requestType === 'Delete') {
              deleteRequests.push(body);
              return HttpResponse.xml(buildDeleteResponse());
            }

            return HttpResponse.xml(buildEmptyRetrieveResponse());
          },
        ),
      );

      const job = createMockPollJob({
        runId,
        queryDefinitionId: existingQdId, // Has existing ID, skip retrieve
      });

      const result = await processor.process(job);

      expect(result).toEqual({ status: 'canceled', runId });

      // Delete should have been called with the existing QD ID
      expect(deleteRequests.some(req => req.includes(existingQdId))).toBe(true);
    });
  });

  describe('onFailed cleanup behavior', () => {
    it('should perform cleanup on permanent failure', async () => {
      // Create a run in 'running' status
      await createShellQueryRun(runId, 'running', TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      const deleteRequests: string[] = [];
      let retrieveAttempted = false;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            const requestType = detectRequestType(body);

            if (requestType === 'Retrieve') {
              retrieveAttempted = true;
              return HttpResponse.xml(buildRetrieveResponse('qd-failed-job', `QPP_Query_${runId}`));
            }

            if (requestType === 'Delete') {
              deleteRequests.push(body);
              return HttpResponse.xml(buildDeleteResponse());
            }

            return HttpResponse.xml(buildEmptyRetrieveResponse());
          },
        ),
      );

      const job = createMockExecuteJob({ runId });

      // Simulate onFailed being called by BullMQ
      await processor.onFailed(job, new Error('Permanent failure'));

      // Verify cleanup was attempted
      expect(retrieveAttempted).toBe(true);
      expect(deleteRequests.length).toBeGreaterThan(0);

      // Verify run status was updated to 'failed'
      const finalStatus = await getRunStatus(runId);
      expect(finalStatus).toBe('failed');
    });

    it('should skip cleanup on intermediate failure (will retry)', async () => {
      await createShellQueryRun(runId, 'running', TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      let soapCalled = false;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            soapCalled = true;
            return HttpResponse.xml(buildEmptyRetrieveResponse());
          },
        ),
      );

      const job = createMockExecuteJob({ runId });
      // Set attemptsMade < opts.attempts to simulate non-final attempt
      (job as unknown as { attemptsMade: number }).attemptsMade = 1;
      (job.opts as { attempts: number }).attempts = 3;

      await processor.onFailed(job, new Error('Transient failure'));

      // Should NOT call SOAP for cleanup
      expect(soapCalled).toBe(false);

      // Run status should NOT be updated (will retry)
      const finalStatus = await getRunStatus(runId);
      expect(finalStatus).toBe('running');
    });
  });

  describe('Cleanup error handling', () => {
    it('should continue gracefully when cleanup fails', async () => {
      await createShellQueryRun(runId, 'canceled', TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      let retrieveAttempted = false;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            const requestType = detectRequestType(body);

            if (requestType === 'Retrieve') {
              retrieveAttempted = true;
              return HttpResponse.xml(buildRetrieveResponse('qd-cleanup-fail', `QPP_Query_${runId}`));
            }

            if (requestType === 'Delete') {
              // Simulate delete failure
              return HttpResponse.xml(buildDeleteResponse('Error'));
            }

            return HttpResponse.xml(buildEmptyRetrieveResponse());
          },
        ),
      );

      const job = createMockPollJob({
        runId,
        queryDefinitionId: '', // Force retrieve path
      });

      // Should not throw despite cleanup failure
      const result = await processor.process(job);

      expect(result).toEqual({ status: 'canceled', runId });
      expect(retrieveAttempted).toBe(true);
    });

    it('should handle missing QueryDefinition during cleanup gracefully', async () => {
      await createShellQueryRun(runId, 'canceled', TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      let retrieveAttempted = false;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            const requestType = detectRequestType(body);

            if (requestType === 'Retrieve') {
              retrieveAttempted = true;
              // Return empty - QueryDefinition doesn't exist
              return HttpResponse.xml(buildEmptyRetrieveResponse());
            }

            return HttpResponse.xml(buildEmptyRetrieveResponse());
          },
        ),
      );

      const job = createMockPollJob({
        runId,
        queryDefinitionId: '', // Force retrieve path
      });

      // Should not throw
      const result = await processor.process(job);

      expect(result).toEqual({ status: 'canceled', runId });
      expect(retrieveAttempted).toBe(true);
    });
  });
});
