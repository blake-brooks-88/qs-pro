/**
 * Status Events Integration Tests
 *
 * Tests the SSE status event flow with real infrastructure:
 * - Real NestJS TestingModule with actual services
 * - Real PostgreSQL for shell_query_runs state
 * - Stub Redis that tracks published events for verification
 * - MSW for MCE SOAP/REST endpoints only
 *
 * Test Strategy:
 * - Call processor.process() directly (simulating BullMQ job processing)
 * - Track Redis publish() calls to verify SSE event sequence
 * - Verify event payloads contain required fields (status, message, timestamp, runId)
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
  LoggerModule,
  MCE_AUTH_PROVIDER,
  type MceAuthProvider,
  MceModule,
  validateWorkerEnv,
} from '@qpp/backend-shared';
import { externalOnlyOnUnhandledRequest, resetFactories } from '@qpp/test-utils';
import { Job, Queue } from 'bullmq';
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
} from 'vitest';

import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { MceQueryValidator } from '../src/shell-query/mce-query-validator';
import { STATUS_MESSAGES, type RunStatus } from '../src/shell-query/shell-query.types';

// Test constants - unique per test run
const TEST_RUN_SUFFIX = Date.now();
const TEST_TSSD = 'status-events-tssd';
const TEST_TENANT_ID = randomUUID();
const TEST_USER_ID = randomUUID();
const TEST_MID = `mid-status-${TEST_RUN_SUFFIX}`;
const TEST_EID = `eid-status-${TEST_RUN_SUFFIX}`;
const TEST_SF_USER_ID = `sf-user-status-${TEST_RUN_SUFFIX}`;

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
    inc: () => {},
    dec: () => {},
    observe: () => {},
  };
}

// Stub Redis client that tracks published events (raw messages for later decryption)
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

      // DataFolder Retrieve
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
                    <Value>Complete</Value>
                  </Property>
                  <Property>
                    <Name>CompletedDate</Name>
                    <Value>${new Date().toISOString()}</Value>
                  </Property>
                </Properties>
              </Results>
            </RetrieveResponseMsg>
          </soap:Body>
        </soap:Envelope>`);
      }

      // Default response
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
    () => HttpResponse.json({ queryValid: true }),
  ),

  // REST: Get rowset (results)
  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset`,
    ({ request }) => {
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('$page') ?? '1', 10);
      const pageSize = parseInt(url.searchParams.get('$pageSize') ?? '50', 10);

      return HttpResponse.json({
        items: [
          {
            keys: { _CustomObjectKey: '1' },
            values: { Name: 'Test User 1' },
          },
        ],
        count: 1,
        page,
        pageSize,
      });
    },
  ),

  // REST: isRunning check
  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:id/actions/isrunning/`,
    () => HttpResponse.json({ isRunning: false }),
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
      notRunningConfirmations: 0,
      rowsetReadyAttempts: 0,
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    updateData: async () => {},
    moveToDelayed: async () => {},
  };
}

describe('Status Events (integration)', () => {
  let module: TestingModule;
  let processor: ShellQueryProcessor;
  let sqlClient: Sql;
  let encryptionService: EncryptionService;
  let queueStub: ReturnType<typeof createQueueStub>;
  let redisStub: ReturnType<typeof createRedisClientStub>;

  const createdRunIds: string[] = [];

  // Helper to decrypt and parse events
  function getDecryptedEvents(): Array<{ channel: string; payload: Record<string, unknown> }> {
    return redisStub.__publishedEvents.map(e => {
      const decrypted = encryptionService.decrypt(e.message) ?? e.message;
      try {
        return { channel: e.channel, payload: JSON.parse(decrypted) as Record<string, unknown> };
      } catch {
        return { channel: e.channel, payload: { raw: decrypted } };
      }
    });
  }

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    queueStub = createQueueStub();
    redisStub = createRedisClientStub();
    const metricsStub = createMetricsStub();

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
        { provide: 'METRICS_ACTIVE_JOBS', useValue: metricsStub },
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
      VALUES (${TEST_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid, ${TEST_SF_USER_ID}, ${'status@test.com'}, ${'Status Test User'})
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

    // Clean up in order
    try {
      await sqlClient`DELETE FROM shell_query_runs WHERE tenant_id = ${TEST_TENANT_ID}::uuid`;
    } catch { /* ignore */ }

    try {
      const reserved = await sqlClient.reserve();
      await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`DELETE FROM credentials WHERE tenant_id = ${TEST_TENANT_ID}::uuid AND mid = ${TEST_MID}`;
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    } catch { /* ignore */ }

    try {
      await sqlClient`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
    } catch { /* ignore */ }

    try {
      await sqlClient`DELETE FROM tenants WHERE id = ${TEST_TENANT_ID}::uuid`;
    } catch { /* ignore */ }

    await module.close();
  }, 30000);

  beforeEach(async () => {
    resetFactories();
    server.resetHandlers();
    redisStub.__publishedEvents.length = 0;
    redisStub.__storedKeys.clear();
    (queueStub as unknown as { __addedJobs: Array<unknown> }).__addedJobs.length = 0;
  });

  afterEach(async () => {
    for (const runId of createdRunIds) {
      try {
        await sqlClient`DELETE FROM shell_query_runs WHERE id = ${runId}::uuid`;
      } catch { /* ignore */ }
    }
    createdRunIds.length = 0;
  });

  async function createTestRun(sqlText: string = 'SELECT 1'): Promise<string> {
    const runId = randomUUID();
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

  describe('Execute job status events', () => {
    it('should publish status events in correct order during execute', async () => {
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

      // Extract status values from published events
      const events = getDecryptedEvents();
      const statuses = events.map(e => e.payload.status as string);

      // Verify expected statuses were published
      expect(statuses).toContain('queued');
      expect(statuses).toContain('validating_query');
      expect(statuses).toContain('creating_data_extension');
      expect(statuses).toContain('executing_query');

      // Verify order
      const queuedIdx = statuses.indexOf('queued');
      const validatingIdx = statuses.indexOf('validating_query');
      const creatingIdx = statuses.indexOf('creating_data_extension');
      const executingIdx = statuses.indexOf('executing_query');

      expect(queuedIdx).toBeLessThan(validatingIdx);
      expect(validatingIdx).toBeLessThan(creatingIdx);
      expect(creatingIdx).toBeLessThan(executingIdx);
    });

    it('should include human-readable message with each status event', async () => {
      const runId = await createTestRun('SELECT 1');
      const encryptedSql = encryptionService.encrypt('SELECT 1') ?? '';

      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: encryptedSql,
      });

      await processor.process(job as Job);

      const events = getDecryptedEvents();
      for (const event of events) {
        const payload = event.payload as { status: RunStatus; message: string };
        expect(payload.message).toBeDefined();
        expect(typeof payload.message).toBe('string');
        expect(payload.message.length).toBeGreaterThan(0);
        expect(payload.message).toBe(STATUS_MESSAGES[payload.status]);
      }
    });

    it('should include timestamp and runId with each status event', async () => {
      const runId = await createTestRun('SELECT 1');
      const encryptedSql = encryptionService.encrypt('SELECT 1') ?? '';

      const job = createMockExecuteJob({
        runId,
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
        eid: TEST_EID,
        sqlText: encryptedSql,
      });

      await processor.process(job as Job);

      const events = getDecryptedEvents();
      for (const event of events) {
        const payload = event.payload as { status: string; timestamp: string; runId: string };
        expect(payload.runId).toBe(runId);
        expect(payload.timestamp).toBeDefined();
        expect(() => new Date(payload.timestamp)).not.toThrow();
        expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
      }
    });
  });

  describe('Poll job status events', () => {
    it('should emit fetching_results and ready statuses when poll completes', async () => {
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

      await processor.process(job as Job);

      const events = getDecryptedEvents();
      const statuses = events.map(e => e.payload.status as string);

      expect(statuses).toContain('fetching_results');
      expect(statuses).toContain('ready');

      const fetchingIdx = statuses.indexOf('fetching_results');
      const readyIdx = statuses.indexOf('ready');
      expect(fetchingIdx).toBeLessThan(readyIdx);
    });

    it('should emit canceled status when run is canceled during polling', async () => {
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

      const events = getDecryptedEvents();
      const canceledEvent = events.find(e => e.payload.status === 'canceled');

      expect(canceledEvent).toBeDefined();
      expect(canceledEvent?.payload.message).toBe(STATUS_MESSAGES.canceled);
    });
  });

  describe('Failure status events', () => {
    it('should include errorMessage in failed event via onFailed handler', async () => {
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
        attemptsMade: 3,
      };

      const errorMessage = 'MCE Query Execution Error: Invalid syntax';
      await processor.onFailed(job as Job, new Error(errorMessage));

      const events = getDecryptedEvents();
      const failedEvent = events.find(e => e.payload.status === 'failed');

      expect(failedEvent).toBeDefined();
      expect(failedEvent?.payload.errorMessage).toBe(errorMessage);
      expect(failedEvent?.payload.message).toContain('failed');
    });
  });
});
