/**
 * ShellQueryProcessor Integration Tests
 *
 * Tests the ShellQueryProcessor with real infrastructure:
 * - Real NestJS TestingModule with actual services
 * - Real PostgreSQL for credentials, shell_query_runs
 * - Stub Redis for SSE event publishing (tracks published events)
 * - MSW for MCE SOAP/REST endpoints only
 *
 * Test Strategy:
 * - Call processor.process() directly (simulating BullMQ job processing)
 * - Wire up real services (EncryptionService, RlsContextService, etc.)
 * - MSW intercepts MCE HTTP/SOAP calls at the external boundary
 * - Verify database state after processing (behavioral assertions)
 * - Zero vi.mock() on internal services
 */
import { getQueueToken } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DatabaseModule,
  EncryptionService,
  ErrorCode,
  LoggerModule,
  MCE_AUTH_PROVIDER,
  type MceAuthProvider,
  MceModule,
  RlsContextService,
  validateWorkerEnv,
} from '@qpp/backend-shared';
import { resetFactories } from '@qpp/test-utils';
import { DelayedError, Job, Queue, UnrecoverableError } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
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
  vi,
} from 'vitest';

import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { MceQueryValidator } from '../src/shell-query/mce-query-validator';

// Test constants - all unique per test run to avoid constraint conflicts
const TEST_RUN_SUFFIX = Date.now();
const TEST_TSSD = 'processor-test-tssd';
const TEST_TENANT_ID = randomUUID();
const TEST_USER_ID = randomUUID();
const TEST_MID = `mid-processor-${TEST_RUN_SUFFIX}`;
const TEST_EID = `eid-processor-${TEST_RUN_SUFFIX}`;
const TEST_SF_USER_ID = `sf-user-proc-${TEST_RUN_SUFFIX}`;

// Track MCE requests for verification
const mceRequests: Array<{ type: string; action?: string; body?: string }> = [];
let asyncActivityStatusOverride:
  | {
      status: string;
      completedDate?: string;
      errorMsg?: string;
    }
  | null = null;

// Stub auth provider
function createStubAuthProvider(): MceAuthProvider {
  return {
    refreshToken: async () => ({
      accessToken: 'test-access-token',
      tssd: TEST_TSSD,
    }),
    invalidateToken: async () => {},
  };
}

// Stub BullMQ queue
function createQueueStub(): Partial<Queue> {
  const addedJobs: Array<{ name: string; data: unknown; opts: unknown }> = [];
  return {
    add: async (name: string, data: unknown, opts: unknown) => {
      addedJobs.push({ name, data, opts });
      return { id: `job-${Date.now()}` } as Job;
    },
    getJob: async () => null,
    getJobs: async () => [],
    __addedJobs: addedJobs,
  } as unknown as Partial<Queue>;
}

// Stub metrics
function createMetricsStub() {
  return {
    inc: vi.fn(),
    dec: vi.fn(),
    observe: vi.fn(),
  };
}

// Stub Redis client that tracks published events
function createRedisClientStub() {
  const publishedEvents: Array<{ channel: string; message: string }> = [];
  const storedKeys: Map<string, string> = new Map();

  return {
    publish: async (channel: string, message: string) => {
      publishedEvents.push({ channel, message });
    },
    set: async (key: string, value: string) => {
      storedKeys.set(key, value);
    },
    get: async (key: string) => storedKeys.get(key),
    __publishedEvents: publishedEvents,
    __storedKeys: storedKeys,
  };
}

// MSW server with MCE endpoint handlers
const server = setupServer(
  // SOAP endpoint handler
  http.post(
    `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
    async ({ request }) => {
      const body = await request.text();
      const soapAction = request.headers.get('SOAPAction') ?? '';

      mceRequests.push({ type: 'SOAP', action: soapAction, body });

      // DataFolder Retrieve - QPP folder
      if (
        body.includes('<ObjectType>DataFolder</ObjectType>') &&
        soapAction.includes('Retrieve')
      ) {
        if (body.includes('QueryPlusPlus Results')) {
          return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <OverallStatus>OK</OverallStatus>
                <Results xsi:type="DataFolder" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                  <ID>12345</ID>
                  <Name>QueryPlusPlus Results</Name>
                  <ContentType>dataextension</ContentType>
                </Results>
              </RetrieveResponseMsg>
            </soap:Body>
          </soap:Envelope>`);
        }
        if (body.includes('Data Extensions')) {
          return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
          <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
            <soap:Body>
              <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                <OverallStatus>OK</OverallStatus>
                <Results xsi:type="DataFolder" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                  <ID>1</ID>
                  <Name>Data Extensions</Name>
                  <ContentType>dataextension</ContentType>
                </Results>
              </RetrieveResponseMsg>
            </soap:Body>
          </soap:Envelope>`);
        }
      }

      // DataExtension Create
      if (
        body.includes('<Objects xsi:type="DataExtension"') &&
        soapAction.includes('Create')
      ) {
        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <CreateResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <Results>
                <StatusCode>OK</StatusCode>
                <StatusMessage>Created</StatusMessage>
                <NewID>111</NewID>
                <NewObjectID>de-object-id-${Date.now()}</NewObjectID>
              </Results>
            </CreateResponse>
          </soap:Body>
        </soap:Envelope>`);
      }

      // QueryDefinition Create
      if (
        body.includes('<Objects xsi:type="QueryDefinition"') &&
        soapAction.includes('Create')
      ) {
        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <CreateResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <Results>
                <StatusCode>OK</StatusCode>
                <StatusMessage>Created</StatusMessage>
                <NewID>222</NewID>
                <NewObjectID>qd-object-id-${Date.now()}</NewObjectID>
              </Results>
            </CreateResponse>
          </soap:Body>
        </soap:Envelope>`);
      }

      // QueryDefinition Retrieve
      if (
        body.includes('<ObjectType>QueryDefinition</ObjectType>') &&
        soapAction.includes('Retrieve')
      ) {
        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <OverallStatus>OK</OverallStatus>
              <Results xsi:type="QueryDefinition" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                <ObjectID>qd-retrieved-object-id</ObjectID>
                <CustomerKey>QPP_Query_test</CustomerKey>
                <Name>QPP Query Test</Name>
              </Results>
            </RetrieveResponseMsg>
          </soap:Body>
        </soap:Envelope>`);
      }

      // QueryDefinition Delete
      if (
        body.includes('<Objects xsi:type="QueryDefinition"') &&
        soapAction.includes('Delete')
      ) {
        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <DeleteResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <Results>
                <StatusCode>OK</StatusCode>
                <StatusMessage>Deleted</StatusMessage>
              </Results>
            </DeleteResponse>
          </soap:Body>
        </soap:Envelope>`);
      }

      // QueryDefinition Perform
      if (body.includes('QueryDefinition') && soapAction.includes('Perform')) {
        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <PerformResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <Results>
                <Result>
                  <StatusCode>OK</StatusCode>
                  <StatusMessage>Performed</StatusMessage>
                  <Task>
                    <StatusCode>OK</StatusCode>
                    <StatusMessage>Queued</StatusMessage>
                    <ID>task-${Date.now()}</ID>
                    <InteractionObjectID>interaction-obj-id</InteractionObjectID>
                  </Task>
                </Result>
              </Results>
            </PerformResponseMsg>
          </soap:Body>
        </soap:Envelope>`);
      }

      // AsyncActivityStatus Retrieve (poll status)
      if (body.includes('<ObjectType>AsyncActivityStatus</ObjectType>')) {
        const status = asyncActivityStatusOverride?.status ?? 'Complete';
        const completedDate = asyncActivityStatusOverride
          ? asyncActivityStatusOverride.completedDate
          : new Date().toISOString();
        const errorMsg = asyncActivityStatusOverride?.errorMsg;

        const completedDateXml =
          typeof completedDate === 'string' && completedDate.trim()
            ? `<Property>
                    <Name>CompletedDate</Name>
                    <Value>${completedDate}</Value>
                  </Property>`
            : '';

        const errorMsgXml =
          typeof errorMsg === 'string' && errorMsg.trim()
            ? `<Property>
                    <Name>ErrorMsg</Name>
                    <Value>${errorMsg}</Value>
                  </Property>`
            : '';

        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <OverallStatus>OK</OverallStatus>
              <Results>
                <ObjectID>async-activity-obj-id</ObjectID>
                <Properties>
                  <Property>
                    <Name>Status</Name>
                    <Value>${status}</Value>
                  </Property>
                  ${completedDateXml}
                  ${errorMsgXml}
                </Properties>
              </Results>
            </RetrieveResponseMsg>
          </soap:Body>
        </soap:Envelope>`);
      }

      // Default empty response
      return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
            <OverallStatus>OK</OverallStatus>
          </RetrieveResponseMsg>
        </soap:Body>
      </soap:Envelope>`);
    },
  ),

  // REST: Query validation
  http.post(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
    () => {
      mceRequests.push({ type: 'REST', action: 'validate' });
      return HttpResponse.json({ queryValid: true });
    },
  ),

  // REST: Check isRunning
  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:id/actions/isrunning/`,
    () => {
      mceRequests.push({ type: 'REST', action: 'isRunning' });
      return HttpResponse.json({ isRunning: false });
    },
  ),

  // REST: Get rowset (results)
  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset`,
    ({ request }) => {
      mceRequests.push({ type: 'REST', action: 'rowset' });

      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('$page') ?? '1', 10);
      const pageSize = parseInt(url.searchParams.get('$pageSize') ?? '50', 10);

      return HttpResponse.json({
        items: [
          {
            keys: { _CustomObjectKey: '1' },
            values: { Name: 'Test User 1', Age: '25' },
          },
        ],
        count: 1,
        page,
        pageSize,
      });
    },
  ),
);

// Create mock BullMQ job
function createMockExecuteJob(data: {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  eid?: string;
  sqlText?: string;
}): Partial<Job> {
  return {
    id: `job-${data.runId}`,
    name: 'execute-shell-query',
    data: {
      runId: data.runId,
      tenantId: data.tenantId,
      userId: data.userId,
      mid: data.mid,
      eid: data.eid ?? TEST_EID,
      sqlText: data.sqlText ?? 'SELECT 1',
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateData: async () => {},
    moveToDelayed: async () => {},
  };
}

function createMockPollJob(data: {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  taskId?: string;
  queryDefinitionId?: string;
  queryCustomerKey?: string;
  targetDeName?: string;
  pollCount?: number;
  pollStartedAt?: string;
  notRunningConfirmations?: number;
  rowsetReadyAttempts?: number;
}): Partial<Job> {
  return {
    id: `poll-job-${data.runId}`,
    name: 'poll-shell-query',
    data: {
      runId: data.runId,
      tenantId: data.tenantId,
      userId: data.userId,
      mid: data.mid,
      taskId: data.taskId ?? 'task-123',
      queryDefinitionId: data.queryDefinitionId ?? 'qd-123',
      queryCustomerKey: data.queryCustomerKey ?? `QPP_Query_${data.runId}`,
      targetDeName: data.targetDeName ?? `QPP_Results_${data.runId.substring(0, 8)}`,
      pollCount: data.pollCount ?? 0,
      pollStartedAt: data.pollStartedAt ?? new Date().toISOString(),
      notRunningConfirmations: data.notRunningConfirmations ?? 0,
      rowsetReadyAttempts: data.rowsetReadyAttempts ?? 0,
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateData: async () => {},
    moveToDelayed: async () => {},
  };
}

describe('ShellQueryProcessor (integration)', () => {
  let module: TestingModule;
  let processor: ShellQueryProcessor;
  let sqlClient: Sql;
  let encryptionService: EncryptionService;
  let queueStub: ReturnType<typeof createQueueStub>;
  let redisStub: ReturnType<typeof createRedisClientStub>;
  let metricsActiveJobsStub: ReturnType<typeof createMetricsStub>;

  // Track created entities for cleanup
  const createdRunIds: string[] = [];

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });

    queueStub = createQueueStub();
    redisStub = createRedisClientStub();
    const metricsStub = createMetricsStub();
    metricsActiveJobsStub = createMetricsStub();

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
        { provide: 'REDIS_CLIENT', useValue: redisStub },
        { provide: 'METRICS_JOBS_TOTAL', useValue: metricsStub },
        { provide: 'METRICS_DURATION', useValue: metricsStub },
        { provide: 'METRICS_FAILURES_TOTAL', useValue: metricsStub },
        { provide: 'METRICS_ACTIVE_JOBS', useValue: metricsActiveJobsStub },
        { provide: getQueueToken('shell-query'), useValue: queueStub },
      ],
    })
      .overrideProvider(MCE_AUTH_PROVIDER)
      .useValue(createStubAuthProvider())
      .compile();

    processor = module.get(ShellQueryProcessor);
    sqlClient = module.get<Sql>('SQL_CLIENT');
    encryptionService = module.get(EncryptionService);

    processor.setTestMode(true);

    // Create test tenant and user
    await sqlClient`
      INSERT INTO tenants (id, eid, tssd)
      VALUES (${TEST_TENANT_ID}::uuid, ${TEST_EID}, ${TEST_TSSD})
      ON CONFLICT (id) DO NOTHING
    `;

    await sqlClient`
      INSERT INTO users (id, tenant_id, sf_user_id, email, name)
      VALUES (${TEST_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid, ${TEST_SF_USER_ID}, ${'proc@test.com'}, ${'Processor Test User'})
      ON CONFLICT (id) DO NOTHING
    `;

    // Create credentials with RLS context
    const encryptedAccessToken = encryptionService.encrypt('test-access-token') ?? '';
    const encryptedRefreshToken = encryptionService.encrypt('test-refresh-token') ?? '';

    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`
      INSERT INTO credentials (tenant_id, mid, user_id, access_token, refresh_token, expires_at)
      VALUES (
        ${TEST_TENANT_ID}::uuid,
        ${TEST_MID},
        ${TEST_USER_ID}::uuid,
        ${encryptedAccessToken},
        ${encryptedRefreshToken},
        ${new Date(Date.now() + 3600000).toISOString()}
      )
      ON CONFLICT DO NOTHING
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    reserved.release();
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up test data in correct order (due to FK constraints)
    // 1. Delete shell_query_runs (references users and tenants)
    try {
      await sqlClient`DELETE FROM shell_query_runs WHERE tenant_id = ${TEST_TENANT_ID}::uuid`;
    } catch {
      // Best effort cleanup
    }

    // 2. Clean up credentials with RLS context
    try {
      const reserved = await sqlClient.reserve();
      await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`DELETE FROM credentials WHERE tenant_id = ${TEST_TENANT_ID}::uuid AND mid = ${TEST_MID}`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    } catch {
      // Ignore cleanup errors
    }

    // 3. Delete users (references tenants)
    try {
      await sqlClient`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
    } catch {
      // Best effort cleanup
    }

    // 4. Delete tenants
    try {
      await sqlClient`DELETE FROM tenants WHERE id = ${TEST_TENANT_ID}::uuid`;
    } catch {
      // Best effort cleanup
    }

    await module.close();
  }, 30000);

  beforeEach(async () => {
    resetFactories();
    server.resetHandlers();
    mceRequests.length = 0;
    asyncActivityStatusOverride = null;
    redisStub.__publishedEvents.length = 0;
    redisStub.__storedKeys.clear();
    (queueStub as unknown as { __addedJobs: Array<unknown> }).__addedJobs.length = 0;
    metricsActiveJobsStub.inc.mockClear();
    metricsActiveJobsStub.dec.mockClear();
  });

  afterEach(async () => {
    // Clean up runs created in this test
    for (const runId of createdRunIds) {
      try {
        await sqlClient`DELETE FROM shell_query_runs WHERE id = ${runId}::uuid`;
      } catch {
        // Best effort cleanup
      }
    }
    createdRunIds.length = 0;
  });

  async function createTestRun(sqlText: string = 'SELECT 1'): Promise<string> {
    const runId = randomUUID();
    // Note: shell_query_runs stores sqlTextHash (a hash), NOT the actual SQL text
    // The actual SQL is passed via BullMQ job data, not stored in DB
    const sqlTextHash = createHash('sha256').update(sqlText).digest('hex');

    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
    await reserved`
      INSERT INTO shell_query_runs (id, tenant_id, user_id, mid, sql_text_hash, status)
      VALUES (${runId}::uuid, ${TEST_TENANT_ID}::uuid, ${TEST_USER_ID}::uuid, ${TEST_MID}, ${sqlTextHash}, 'queued')
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();

    createdRunIds.push(runId);
    return runId;
  }

  async function getRunFromDb(runId: string): Promise<{
    status: string;
    taskId: string | null;
    queryDefinitionId: string | null;
    errorMessage: string | null;
    completedAt: Date | null;
  }> {
    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
    const result = await reserved`
      SELECT status, task_id, query_definition_id, error_message, completed_at
      FROM shell_query_runs
      WHERE id = ${runId}::uuid
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();

    const row = result[0];
    return {
      status: row?.status ?? 'unknown',
      taskId: row?.task_id ?? null,
      queryDefinitionId: row?.query_definition_id ?? null,
      errorMessage: row?.error_message
        ? (encryptionService.decrypt(row.error_message) ?? null)
        : null,
      completedAt: row?.completed_at ?? null,
    };
  }

  async function updateRunStatus(runId: string, status: string): Promise<void> {
    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
    await reserved`UPDATE shell_query_runs SET status = ${status} WHERE id = ${runId}::uuid`;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();
  }

  async function updateRunForPoll(runId: string): Promise<void> {
    const reserved = await sqlClient.reserve();
    await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
    await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
    await reserved`SELECT set_config('app.user_id', ${TEST_USER_ID}, false)`;
    await reserved`
      UPDATE shell_query_runs
      SET status = 'running', task_id = 'task-123', query_definition_id = 'qd-123', poll_started_at = NOW()
      WHERE id = ${runId}::uuid
    `;
    await reserved`RESET app.tenant_id`;
    await reserved`RESET app.mid`;
    await reserved`RESET app.user_id`;
    reserved.release();
  }

  describe('handleExecute', () => {
    it('should execute flow and enqueue poll job', async () => {
      const runId = await createTestRun('SELECT Name FROM TestDE');
      const encryptedSql = encryptionService.encrypt('SELECT Name FROM TestDE') ?? '';

      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: encryptedSql,
      });

      const result = await processor.process(job as Job);

      // Verify result structure
      expect(result).toMatchObject({
        status: 'poll-enqueued',
        runId,
      });
      expect((result as { taskId?: string }).taskId).toBeDefined();

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('running');
      expect(dbRun.taskId).toBeDefined();
      expect(dbRun.queryDefinitionId).toBeDefined();

      // Verify poll job was enqueued
      const addedJobs = (queueStub as unknown as { __addedJobs: Array<{ name: string }> }).__addedJobs;
      expect(addedJobs.length).toBe(1);
      expect(addedJobs[0].name).toBe('poll-shell-query');
    });

    it('should detect cancellation before execution', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunStatus(runId, 'canceled');

      const encryptedSql = encryptionService.encrypt('SELECT 1') ?? '';
      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: encryptedSql,
      });

      const result = await processor.process(job as Job);

      expect(result).toEqual({ status: 'canceled', runId });

      // Verify SSE event published
      expect(redisStub.__publishedEvents.some(e => e.channel.includes(runId))).toBe(true);
    });

    it('throws UnrecoverableError when sqlText cannot be decrypted', async () => {
      const runId = await createTestRun('SELECT 1');

      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: 'not-a-valid-ciphertext',
      });

      const promise = processor.process(job as Job);
      await expect(promise).rejects.toThrow(UnrecoverableError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({
          code: ErrorCode.INTERNAL_ERROR,
        }),
      });
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      });
    });

    it('wraps terminal errors in UnrecoverableError', async () => {
      const runId = await createTestRun('SELECT Name FROM TestDE');
      const encryptedSql = encryptionService.encrypt('SELECT Name FROM TestDE') ?? '';

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          () => {
            return HttpResponse.json(
              { queryValid: false, errorMessage: 'Validation failed' },
              { status: 200 },
            );
          },
        ),
      );

      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: encryptedSql,
      });

      const promise = processor.process(job as Job);
      await expect(promise).rejects.toThrow(UnrecoverableError);
      await expect(promise).rejects.toMatchObject({
        cause: expect.objectContaining({
          code: ErrorCode.MCE_VALIDATION_FAILED,
        }),
      });
    });

    it('increments and decrements active jobs metric', async () => {
      const runId = await createTestRun('SELECT Name FROM TestDE');
      const encryptedSql = encryptionService.encrypt('SELECT Name FROM TestDE') ?? '';

      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: encryptedSql,
      });

      await processor.process(job as Job);

      expect(metricsActiveJobsStub.inc).toHaveBeenCalledTimes(1);
      expect(metricsActiveJobsStub.dec).toHaveBeenCalledTimes(1);
    });
  });

  describe('handlePoll', () => {
    it('should complete when MCE status is Complete', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        taskId: 'task-123',
        queryDefinitionId: 'qd-123',
      });

      const result = await processor.process(job as Job);

      expect(result).toEqual({ status: 'completed', runId });

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('ready');
      expect(dbRun.completedAt).not.toBeNull();
    });

    it('should handle error status from MCE', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      // Override MSW to return error status
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            if (body.includes('<ObjectType>AsyncActivityStatus</ObjectType>')) {
              return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
              <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                  <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                    <OverallStatus>OK</OverallStatus>
                    <Results>
                      <ObjectID>async-activity-obj-id</ObjectID>
                      <Properties>
                        <Property>
                          <Name>Status</Name>
                          <Value>Error</Value>
                        </Property>
                        <Property>
                          <Name>ErrorMsg</Name>
                          <Value>Syntax error in query</Value>
                        </Property>
                      </Properties>
                    </Results>
                  </RetrieveResponseMsg>
                </soap:Body>
              </soap:Envelope>`);
            }
            if (body.includes('QueryDefinition') && request.headers.get('SOAPAction')?.includes('Delete')) {
              return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
              <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                  <DeleteResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
                    <Results><StatusCode>OK</StatusCode></Results>
                  </DeleteResponse>
                </soap:Body>
              </soap:Envelope>`);
            }
            return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body><RetrieveResponseMsg><OverallStatus>OK</OverallStatus></RetrieveResponseMsg></soap:Body>
            </soap:Envelope>`);
          },
        ),
      );

      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        taskId: 'task-error',
        queryDefinitionId: 'qd-error',
      });

      const result = await processor.process(job as Job);

      expect(result).toMatchObject({
        status: 'failed',
        runId,
        error: 'Syntax error in query',
      });

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('failed');
      expect(dbRun.errorMessage).toContain('Syntax error');
    });

    it('should stop polling when job is canceled', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunStatus(runId, 'canceled');

      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
      });

      const result = await processor.process(job as Job);

      expect(result).toEqual({ status: 'canceled', runId });
    });

    it('should timeout after max duration', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      // Create job with old pollStartedAt (30 minutes ago)
      const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        pollStartedAt: oldTimestamp,
      });

      const result = await processor.process(job as Job);

      expect(result).toEqual({ status: 'timeout', runId });

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('failed');
      expect(dbRun.errorMessage).toContain('timed out');
    });

    it('should fail when poll budget exceeded', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        pollCount: 120,
      });

      const result = await processor.process(job as Job);

      expect(result).toEqual({ status: 'budget-exceeded', runId });

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('failed');
    });

    it('fast-path completes when row probe detects rows', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      asyncActivityStatusOverride = { status: 'Processing' };

      const pollStartedAt = new Date(Date.now() - 7000).toISOString();
      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        pollStartedAt,
        queryDefinitionId: 'qd-row-probe',
      });

      const result = await processor.process(job as Job);

      expect(result).toEqual({ status: 'completed', runId });

      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('ready');
      expect(mceRequests.some((r) => r.type === 'REST' && r.action === 'rowset')).toBe(
        true,
      );

      expect(metricsActiveJobsStub.inc).toHaveBeenCalledTimes(1);
      expect(metricsActiveJobsStub.dec).toHaveBeenCalledTimes(1);
    });

    it('uses REST isRunning check and persists queryDefinitionId via SOAP fallback when REST returns 400', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      asyncActivityStatusOverride = {
        status: 'Processing',
        completedDate: new Date().toISOString(),
      };

      // Force REST 400 so the worker falls back to SOAP retrieval by customerKey.
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:id/actions/isrunning/`,
          () => {
            mceRequests.push({ type: 'REST', action: 'isRunning' });
            return HttpResponse.json({ message: 'Bad Request' }, { status: 400 });
          },
        ),
      );

      const pollStartedAt = new Date(Date.now() - 7000).toISOString();
      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        pollStartedAt,
        queryDefinitionId: '',
        targetDeName: '',
      });

      const result = await processor.process(job as Job);
      expect(result).toMatchObject({ status: 'polling', runId });

      const dbRun = await getRunFromDb(runId);
      expect(dbRun.queryDefinitionId).toBe('qd-retrieved-object-id');
      expect(
        mceRequests.some(
          (r) =>
            r.type === 'SOAP' &&
            (r.body ?? '').includes('<ObjectType>QueryDefinition</ObjectType>'),
        ),
      ).toBe(true);
    });

    it('requires multiple not-running confirmations before marking ready', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      asyncActivityStatusOverride = {
        status: 'Processing',
        completedDate: new Date().toISOString(),
      };

      const pollStartedAt = new Date(Date.now() - 7000).toISOString();
      const job = createMockPollJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        pollStartedAt,
        targetDeName: '',
      });

      // Make updateData persist state between polls.
      job.updateData = async (updated) => {
        job.data = updated;
      };

      const first = await processor.process(job as Job);
      expect(first).toEqual({ status: 'polling', runId, pollCount: 1 });

      // Simulate passage of time (min gap) without waiting.
      job.data = {
        ...(job.data as object),
        notRunningDetectedAt: new Date(Date.now() - 16000).toISOString(),
        notRunningConfirmations: 1,
      };

      const second = await processor.process(job as Job);
      expect(second).toEqual({ status: 'completed', runId });

      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('ready');
    });
  });

  describe('onFailed event handler', () => {
    it('should update status and publish SSE event on permanent failure', async () => {
      const runId = await createTestRun('SELECT 1');

      const encryptedSql = encryptionService.encrypt('SELECT 1') ?? '';
      // For permanent failure: attemptsMade must be >= opts.attempts
      const job = {
        ...createMockExecuteJob({
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: encryptedSql,
        }),
        opts: { attempts: 3 },
        attemptsMade: 3,
      };

      const error = new Error('Permanent failure');

      await processor.onFailed(job as Job, error);

      // Verify database state
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('failed');
      expect(dbRun.errorMessage).toBe('Permanent failure');

      // Verify SSE event published
      const failedEvent = redisStub.__publishedEvents.find(e => e.channel.includes(runId));
      expect(failedEvent).toBeDefined();

      const decrypted = failedEvent?.message
        ? (encryptionService.decrypt(failedEvent.message) ?? null)
        : null;
      expect(decrypted).not.toBeNull();
      expect(JSON.parse(decrypted ?? '{}')).toMatchObject({
        status: 'failed',
        runId,
      });

      expect(
        mceRequests.some(
          (r) =>
            r.type === 'SOAP' &&
            (r.action ?? '').includes('Delete') &&
            (r.body ?? '').includes('QueryDefinition'),
        ),
      ).toBe(true);
    });

    it('should no-op on intermediate failures that will retry', async () => {
      const runId = await createTestRun('SELECT 1');

      const encryptedSql = encryptionService.encrypt('SELECT 1') ?? '';
      const job = {
        ...createMockExecuteJob({
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: encryptedSql,
        }),
        opts: { attempts: 3 },
        attemptsMade: 1,
      };

      const error = new Error('Transient failure');

      const warnSpy = vi.spyOn(
        (
          processor as unknown as {
            logger: { warn: (...args: unknown[]) => void };
          }
        ).logger,
        'warn',
      );

      await processor.onFailed(job as Job, error);

      // Verify database state NOT updated
      const dbRun = await getRunFromDb(runId);
      expect(dbRun.status).toBe('queued');

      expect(warnSpy).toHaveBeenCalled();
      expect(redisStub.__publishedEvents).toHaveLength(0);
      expect(mceRequests).toHaveLength(0);

      warnSpy.mockRestore();
    });
  });

  describe('BullMQ scheduling (non-test mode)', () => {
    it('should use moveToDelayed when continuing to poll', async () => {
      const runId = await createTestRun('SELECT 1');
      await updateRunForPoll(runId);

      // Override MSW to return Processing status
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            if (body.includes('<ObjectType>AsyncActivityStatus</ObjectType>')) {
              return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
              <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                  <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                    <OverallStatus>OK</OverallStatus>
                    <Results>
                      <Properties>
                        <Property>
                          <Name>Status</Name>
                          <Value>Processing</Value>
                        </Property>
                      </Properties>
                    </Results>
                  </RetrieveResponseMsg>
                </soap:Body>
              </soap:Envelope>`);
            }
            return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
              <soap:Body><RetrieveResponseMsg><OverallStatus>OK</OverallStatus></RetrieveResponseMsg></soap:Body>
            </soap:Envelope>`);
          },
        ),
      );

      processor.setTestMode(false);

      let moveToDelayedCalled = false;
      const job = {
        ...createMockPollJob({
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          pollCount: 0,
        }),
        updateData: async () => {},
        moveToDelayed: async () => {
          moveToDelayedCalled = true;
        },
      };

      await expect(processor.process(job as Job, 'test-token')).rejects.toBeInstanceOf(
        DelayedError,
      );

      expect(moveToDelayedCalled).toBe(true);

      // Reset test mode for subsequent tests
      processor.setTestMode(true);
    });
  });
});
