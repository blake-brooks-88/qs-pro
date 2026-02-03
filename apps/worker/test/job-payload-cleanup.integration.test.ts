/**
 * Job Payload Cleanup Integration Tests
 *
 * Tests that BullMQ job payloads are stripped after completion to reduce Redis memory.
 *
 * Test Strategy:
 * - Real NestJS TestingModule with actual services
 * - Real PostgreSQL for shell_query_runs state
 * - Stub Redis for SSE event publishing
 * - MSW for MCE SOAP/REST endpoints
 * - Call processor event handlers directly to verify payload stripping
 *
 * Covered Behaviors:
 * - Completed jobs have sqlText stripped from Redis payload
 * - Failed jobs retain full payload for debugging
 * - tableMetadata is removed on completion
 * - runId is preserved after stripping
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
import type { ShellQueryJob, PollShellQueryJob } from '../src/shell-query/shell-query.types';

const TEST_RUN_SUFFIX = Date.now();
const TEST_TSSD = 'payload-cleanup-tssd';
const TEST_TENANT_ID = randomUUID();
const TEST_USER_ID = randomUUID();
const TEST_MID = `mid-cleanup-${TEST_RUN_SUFFIX}`;
const TEST_EID = `eid-cleanup-${TEST_RUN_SUFFIX}`;
const TEST_SF_USER_ID = `sf-user-cleanup-${TEST_RUN_SUFFIX}`;

function createStubAuthProvider(): MceAuthProvider {
  return {
    refreshToken: async () => ({
      accessToken: 'test-access-token',
      tssd: TEST_TSSD,
    }),
    invalidateToken: async () => {},
  };
}

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

function createMetricsStub() {
  return {
    inc: () => {},
    dec: () => {},
    observe: () => {},
  };
}

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

const server = setupServer(
  http.post(
    `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
    async ({ request }) => {
      const body = await request.text();
      const soapAction = request.headers.get('SOAPAction') ?? '';

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

  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset`,
    ({ request }) => {
      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('$page') ?? '1', 10);
      const pageSize = parseInt(url.searchParams.get('$pageSize') ?? '50', 10);

      return HttpResponse.json({
        items: [{ keys: { _CustomObjectKey: '1' }, values: { Name: 'Test' } }],
        count: 1,
        page,
        pageSize,
      });
    },
  ),

  http.get(
    `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:id/status`,
    () => HttpResponse.json({ isRunning: false }),
  ),
);

describe('Job Payload Cleanup (integration)', () => {
  let module: TestingModule;
  let processor: ShellQueryProcessor;
  let sqlClient: Sql;
  let encryptionService: EncryptionService;
  let queueStub: ReturnType<typeof createQueueStub>;
  let redisStub: ReturnType<typeof createRedisClientStub>;

  const createdRunIds: string[] = [];

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

    await sqlClient`
      INSERT INTO tenants (id, eid, tssd)
      VALUES (${TEST_TENANT_ID}::uuid, ${TEST_EID}, ${TEST_TSSD})
      ON CONFLICT (id) DO NOTHING
    `;

    await sqlClient`
      INSERT INTO users (id, tenant_id, sf_user_id, email, name)
      VALUES (${TEST_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid, ${TEST_SF_USER_ID}, ${'cleanup@test.com'}, ${'Cleanup Test User'})
      ON CONFLICT (id) DO NOTHING
    `;

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

  describe('onCompleted handler', () => {
    it('should strip sqlText from completed execute job', async () => {
      const runId = await createTestRun('SELECT Name FROM TestDE');
      const originalSqlText = encryptionService.encrypt('SELECT Name FROM TestDE') ?? '';

      let updatedData: ShellQueryJob | null = null;

      const job = {
        id: `job-${runId}`,
        name: 'execute-shell-query',
        data: {
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: originalSqlText,
        } as ShellQueryJob,
        updateData: async (data: ShellQueryJob) => {
          updatedData = data;
        },
      } as unknown as Job<ShellQueryJob>;

      await processor.onCompleted(job);

      expect(updatedData).not.toBeNull();
      expect(updatedData!.sqlText).toBe('[stripped]');
      expect(updatedData!.runId).toBe(runId);
      expect(updatedData!.tenantId).toBe(TEST_TENANT_ID);
    });

    it('should remove tableMetadata from completed job', async () => {
      const runId = await createTestRun('SELECT 1');
      const originalSqlText = encryptionService.encrypt('SELECT 1') ?? '';

      let updatedData: ShellQueryJob | null = null;

      const job = {
        id: `job-${runId}`,
        name: 'execute-shell-query',
        data: {
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: originalSqlText,
          tableMetadata: { columns: [{ name: 'col1', type: 'Text' }] },
        } as ShellQueryJob,
        updateData: async (data: ShellQueryJob) => {
          updatedData = data;
        },
      } as unknown as Job<ShellQueryJob>;

      await processor.onCompleted(job);

      expect(updatedData).not.toBeNull();
      expect(updatedData!.tableMetadata).toBeUndefined();
    });

    it('should preserve all other job data fields', async () => {
      const runId = await createTestRun('SELECT 1');
      const originalSqlText = encryptionService.encrypt('SELECT 1') ?? '';

      let updatedData: ShellQueryJob | null = null;

      const job = {
        id: `job-${runId}`,
        name: 'execute-shell-query',
        data: {
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: originalSqlText,
          snippetName: 'my-snippet',
        } as ShellQueryJob,
        updateData: async (data: ShellQueryJob) => {
          updatedData = data;
        },
      } as unknown as Job<ShellQueryJob>;

      await processor.onCompleted(job);

      expect(updatedData).not.toBeNull();
      expect(updatedData!.runId).toBe(runId);
      expect(updatedData!.tenantId).toBe(TEST_TENANT_ID);
      expect(updatedData!.userId).toBe(TEST_USER_ID);
      expect(updatedData!.mid).toBe(TEST_MID);
      expect(updatedData!.eid).toBe(TEST_EID);
      expect(updatedData!.snippetName).toBe('my-snippet');
    });

    it('should handle poll job completion gracefully (no sqlText)', async () => {
      const runId = await createTestRun('SELECT 1');

      let updatedData: PollShellQueryJob | null = null;

      const job = {
        id: `poll-${runId}`,
        name: 'poll-shell-query',
        data: {
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          taskId: 'task-123',
          queryDefinitionId: 'qd-123',
          queryCustomerKey: `QPP_Query_${runId}`,
          targetDeCustomerKey: `QPP_Results_${runId.substring(0, 8)}`,
          pollCount: 5,
          pollStartedAt: new Date().toISOString(),
          notRunningConfirmations: 0,
        } as PollShellQueryJob,
        updateData: async (data: PollShellQueryJob) => {
          updatedData = data;
        },
      } as unknown as Job<PollShellQueryJob>;

      await processor.onCompleted(job);

      expect(updatedData).not.toBeNull();
      expect(updatedData!.runId).toBe(runId);
      expect(updatedData!.pollCount).toBe(5);
      expect('sqlText' in updatedData!).toBe(false);
    });

    it('should not throw if updateData fails', async () => {
      const runId = await createTestRun('SELECT 1');
      const originalSqlText = encryptionService.encrypt('SELECT 1') ?? '';

      const job = {
        id: `job-${runId}`,
        name: 'execute-shell-query',
        data: {
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: originalSqlText,
        } as ShellQueryJob,
        updateData: async () => {
          throw new Error('Redis connection failed');
        },
      } as unknown as Job<ShellQueryJob>;

      await expect(processor.onCompleted(job)).resolves.toBeUndefined();
    });
  });

  describe('onFailed handler preserves payload', () => {
    it('should NOT strip sqlText from failed job', async () => {
      const runId = await createTestRun('SELECT 1');
      const originalSqlText = encryptionService.encrypt('SELECT 1') ?? '';

      const job = {
        id: `job-${runId}`,
        name: 'execute-shell-query',
        data: {
          runId,
          tenantId: TEST_TENANT_ID,
          userId: TEST_USER_ID,
          mid: TEST_MID,
          eid: TEST_EID,
          sqlText: originalSqlText,
          tableMetadata: { columns: [{ name: 'col1', type: 'Text' }] },
        } as ShellQueryJob,
        opts: { attempts: 3 },
        attemptsMade: 3,
        updateData: async () => {},
      } as unknown as Job<ShellQueryJob>;

      await processor.onFailed(job, new Error('Permanent failure'));

      expect(job.data.sqlText).toBe(originalSqlText);
      expect(job.data.tableMetadata).toBeDefined();
    });
  });
});
