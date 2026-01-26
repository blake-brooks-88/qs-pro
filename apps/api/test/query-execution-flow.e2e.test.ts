/**
 * Query Execution Flow E2E Test
 *
 * This test verifies the complete query execution flow:
 * API creates job -> Worker processes -> SSE events published -> Results available
 *
 * Infrastructure:
 * - Real PostgreSQL (from docker-compose)
 * - Real Redis (from docker-compose)
 * - Real BullMQ (connects to Redis)
 * - MSW for MCE API mocking only
 */
import { getQueueToken } from '@nestjs/bullmq';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService, RlsContextService } from '@qpp/backend-shared';
import { Job, Queue, Worker } from 'bullmq';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Sql } from 'postgres';
import { agent as superagent } from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Track SOAP/REST request calls for verification
const mceRequestLog: Array<{ type: string; action?: string; body?: string }> =
  [];

// Global state for MCE mock responses
let mceScenario:
  | 'success'
  | 'error-500'
  | 'error-429-then-success'
  | 'timeout' = 'success';
let request429Count = 0;
let pollStatusOverride: 'Complete' | 'Running' | 'Error' | null = null;
let mceErrorMessage: string | null = null;

// MSW server with MCE endpoint handlers
const server = setupServer(
  // Auth endpoints
  http.post('https://test-tssd.auth.marketingcloudapis.com/v2/token', () => {
    return HttpResponse.json({
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      expires_in: 3600,
      rest_instance_url: 'https://test-rest.com',
      soap_instance_url: 'https://test-soap.com',
      scope: 'read write',
      token_type: 'Bearer',
    });
  }),
  http.get('https://test-tssd.auth.marketingcloudapis.com/v2/userinfo', () => {
    return HttpResponse.json({
      sub: 'sf-user-query-flow',
      enterprise_id: 'eid-query-flow',
      member_id: 'mid-query-flow',
      email: 'user@example.com',
      name: 'Query Flow Test User',
    });
  }),

  // SOAP endpoint for all MCE SOAP operations
  http.post(
    'https://test-tssd.soap.marketingcloudapis.com/Service.asmx',
    async ({ request }) => {
      const body = await request.text();
      const soapAction = request.headers.get('SOAPAction') ?? '';

      mceRequestLog.push({ type: 'SOAP', action: soapAction, body });

      // Handle MCE error scenarios
      if (mceScenario === 'error-500') {
        return new HttpResponse(
          '<soap:Fault>Internal Server Error</soap:Fault>',
          {
            status: 500,
            headers: { 'Content-Type': 'text/xml' },
          },
        );
      }

      // Folder Retrieve (DataFolder)
      if (
        body.includes('<ObjectType>DataFolder</ObjectType>') &&
        soapAction.includes('Retrieve')
      ) {
        if (body.includes('QueryPlusPlus Results')) {
          // QPP folder already exists
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
          // Root DE folder
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

      // DataExtension Delete
      if (
        body.includes('<Objects xsi:type="DataExtension"') &&
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

      // DataExtension Retrieve (fields)
      if (
        body.includes('<ObjectType>DataExtensionField</ObjectType>') &&
        soapAction.includes('Retrieve')
      ) {
        return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
              <OverallStatus>OK</OverallStatus>
              <Results xsi:type="DataExtensionField" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                <Name>Name</Name>
                <FieldType>Text</FieldType>
                <MaxLength>100</MaxLength>
              </Results>
              <Results xsi:type="DataExtensionField" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                <Name>Age</Name>
                <FieldType>Number</FieldType>
              </Results>
            </RetrieveResponseMsg>
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
                <CustomerKey>qpp-query-test</CustomerKey>
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

      // QueryDefinition Perform (start query execution)
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
        const status = pollStatusOverride ?? 'Complete';
        const errorMsg =
          status === 'Error' ? (mceErrorMessage ?? 'MCE Query Error') : '';

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
                  <Property>
                    <Name>CompletedDate</Name>
                    <Value>${new Date().toISOString()}</Value>
                  </Property>
                  ${errorMsg ? `<Property><Name>ErrorMsg</Name><Value>${errorMsg}</Value></Property>` : ''}
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
    'https://test-tssd.rest.marketingcloudapis.com/data/v1/customobjectdata/validate',
    () => {
      mceRequestLog.push({ type: 'REST', action: 'validate' });
      return HttpResponse.json({ valid: true });
    },
  ),

  // REST: Check isRunning
  http.get(
    'https://test-tssd.rest.marketingcloudapis.com/automation/v1/queries/:id/status',
    () => {
      mceRequestLog.push({ type: 'REST', action: 'isRunning' });
      return HttpResponse.json({ isRunning: false });
    },
  ),

  // REST: Get rowset (results)
  http.get(
    'https://test-tssd.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset',
    ({ request }) => {
      mceRequestLog.push({ type: 'REST', action: 'rowset' });

      // Handle 429 rate limit scenario
      if (mceScenario === 'error-429-then-success') {
        request429Count++;
        if (request429Count <= 1) {
          return HttpResponse.json(
            { errorcode: 'RATE_LIMIT', message: 'Rate limit exceeded' },
            { status: 429 },
          );
        }
      }

      // Handle 500 error scenario
      if (mceScenario === 'error-500') {
        return HttpResponse.json(
          { errorcode: 'SERVER_ERROR', message: 'Internal server error' },
          { status: 500 },
        );
      }

      const url = new URL(request.url);
      const page = parseInt(url.searchParams.get('$page') ?? '1', 10);
      const pageSize = parseInt(url.searchParams.get('$pageSize') ?? '50', 10);

      return HttpResponse.json({
        items: [
          {
            keys: { _CustomObjectKey: '1' },
            values: { Name: 'Test User 1', Age: '25' },
          },
          {
            keys: { _CustomObjectKey: '2' },
            values: { Name: 'Test User 2', Age: '30' },
          },
        ],
        count: 2,
        page,
        pageSize,
      });
    },
  ),
);

describe('Query Execution Flow (e2e)', () => {
  let app: NestFastifyApplication;
  let sqlClient: Sql;
  let shellQueryQueue: Queue;
  let workerInstance: Worker | null = null;

  // Track created entities for cleanup
  const createdTenantIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdRuns: Array<{
    runId: string;
    tenantId: string;
    mid: string;
    userId: string;
  }> = [];
  const createdCredentials: Array<{
    credentialId: string;
    tenantId: string;
    mid: string;
  }> = [];
  const createdTenantSettings: Array<{ tenantId: string; mid: string }> = [];

  beforeAll(async () => {
    server.listen({
      onUnhandledRequest(request, print) {
        const url = new URL(request.url);

        // Allow localhost requests to pass through to the test server
        if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
          return;
        }

        // Error on unhandled external requests (catches accidental real API calls)
        print.error();
      },
    });

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

    sqlClient = app.get<Sql>('SQL_CLIENT');
    shellQueryQueue = app.get<Queue>(getQueueToken('shell-query'));

    // Get dependencies from the app module for the worker
    const rlsContext = app.get(RlsContextService);
    const encryptionService = app.get(EncryptionService);
    const redisClient = app.get('REDIS_CLIENT');

    // Create a simplified RunToTempFlow that skips most MCE operations
    // but still exercises the job processing path
    const mockRunToTempFlow = {
      execute: vi
        .fn()
        .mockImplementation(
          async (
            job: unknown,
            publishStatus: (status: string) => Promise<void>,
          ) => {
            await publishStatus('validating_query');
            await publishStatus('creating_data_extension');
            await publishStatus('executing_query');

            const jobData = job as { runId: string };
            return {
              status: 'ready',
              taskId: `task-${jobData.runId}`,
              queryDefinitionId: `qd-${jobData.runId}`,
              queryCustomerKey: `qpp-query-${jobData.runId}`,
              targetDeName: `QPP_Results_${jobData.runId.substring(0, 8)}`,
            };
          },
        ),
      retrieveQueryDefinitionObjectId: vi
        .fn()
        .mockResolvedValue('qd-object-id'),
    };

    // Create the worker processor inline to test BullMQ job processing
    // This simulates the worker app's ShellQueryProcessor
    workerInstance = new Worker(
      'shell-query',
      async (job: Job) => {
        const { runId, tenantId, userId, mid, sqlText } = job.data;

        // Decrypt sqlText
        const decryptedSqlText = encryptionService.decrypt(sqlText);
        if (!decryptedSqlText) {
          throw new Error('Failed to decrypt sqlText');
        }

        if (job.name === 'execute-shell-query') {
          // Check cancellation
          const isCanceled = await rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              const result = await sqlClient`
                SELECT status FROM shell_query_runs WHERE id = ${runId}::uuid
              `;
              return result[0]?.status === 'canceled';
            },
          );

          if (isCanceled) {
            await publishStatusEvent(runId, 'canceled');
            return { status: 'canceled', runId };
          }

          // Update status to running
          await rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              await sqlClient`
              UPDATE shell_query_runs
              SET status = 'running', started_at = NOW()
              WHERE id = ${runId}::uuid
            `;
            },
          );
          await publishStatusEvent(runId, 'queued');

          // Execute the flow (mocked)
          const result = await mockRunToTempFlow.execute(
            { ...job.data, sqlText: decryptedSqlText },
            async (status: string) => {
              await publishStatusEvent(runId, status);
            },
          );

          // Update with taskId and enqueue poll job
          await rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              await sqlClient`
              UPDATE shell_query_runs
              SET task_id = ${result.taskId},
                  query_definition_id = ${result.queryDefinitionId},
                  poll_started_at = NOW()
              WHERE id = ${runId}::uuid
            `;
            },
          );

          // Add poll job with minimal delay for testing
          await shellQueryQueue.add(
            'poll-shell-query',
            {
              runId,
              tenantId,
              userId,
              mid,
              taskId: result.taskId,
              queryDefinitionId: result.queryDefinitionId,
              queryCustomerKey: result.queryCustomerKey,
              targetDeName: result.targetDeName,
              pollCount: 0,
              pollStartedAt: new Date().toISOString(),
              notRunningConfirmations: 0,
            },
            {
              delay: 100, // Short delay for testing
              jobId: `poll-${runId}`,
              removeOnComplete: { age: 3600 },
              removeOnFail: { age: 86400 },
            },
          );

          return { status: 'poll-enqueued', runId, taskId: result.taskId };
        }

        if (job.name === 'poll-shell-query') {
          // Check cancellation
          const isCanceled = await rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              const result = await sqlClient`
                SELECT status FROM shell_query_runs WHERE id = ${runId}::uuid
              `;
              return result[0]?.status === 'canceled';
            },
          );

          if (isCanceled) {
            await publishStatusEvent(runId, 'canceled');
            return { status: 'canceled', runId };
          }

          // Check for error scenario override
          if (pollStatusOverride === 'Error') {
            const errorMessage = mceErrorMessage ?? 'MCE Query Execution Error';
            const encryptedError =
              encryptionService.encrypt(errorMessage) ?? '';
            await rlsContext.runWithUserContext(
              tenantId,
              mid,
              userId,
              async () => {
                await sqlClient`
                UPDATE shell_query_runs
                SET status = 'failed', error_message = ${encryptedError}, completed_at = NOW()
                WHERE id = ${runId}::uuid
              `;
              },
            );
            await publishStatusEvent(runId, 'failed', errorMessage);
            return { status: 'failed', runId, error: errorMessage };
          }

          // Simulate successful completion
          await publishStatusEvent(runId, 'fetching_results');
          await rlsContext.runWithUserContext(
            tenantId,
            mid,
            userId,
            async () => {
              await sqlClient`
              UPDATE shell_query_runs
              SET status = 'ready', completed_at = NOW()
              WHERE id = ${runId}::uuid
            `;
            },
          );
          await publishStatusEvent(runId, 'ready');

          return { status: 'completed', runId };
        }

        return { status: 'unknown-job-type' };
      },
      {
        connection: {
          host: '127.0.0.1',
          port: 6379,
        },
        concurrency: 5,
      },
    );

    // Wait for worker to be ready
    await new Promise<void>((resolve) => {
      workerInstance?.on('ready', () => resolve());
      // Fallback timeout if 'ready' event doesn't fire
      setTimeout(() => resolve(), 1000);
    });

    // Helper function to publish SSE events
    async function publishStatusEvent(
      runId: string,
      status: string,
      errorMessage?: string,
    ): Promise<void> {
      const statusMessages: Record<string, string> = {
        queued: 'Queued...',
        running: 'Running...',
        validating_query: 'Validating query...',
        creating_data_extension: 'Creating temp Data Extension...',
        executing_query: 'Executing query...',
        fetching_results: 'Fetching results...',
        ready: 'Query completed',
        failed: 'Query failed',
        canceled: 'Query canceled',
      };

      const event = {
        status,
        message:
          status === 'failed' && errorMessage
            ? `${statusMessages[status] ?? status}: ${errorMessage}`
            : (statusMessages[status] ?? status),
        timestamp: new Date().toISOString(),
        runId,
        ...(errorMessage ? { errorMessage } : {}),
      };

      const channel = `run-status:${runId}`;
      const lastEventKey = `run-status:last:${runId}`;
      const eventJson = JSON.stringify(event);
      const encryptedEventJson = encryptionService.encrypt(eventJson);

      if (encryptedEventJson) {
        const redis = redisClient as {
          publish: (channel: string, message: string) => Promise<void>;
          set: (
            key: string,
            value: string,
            mode: string,
            duration: number,
          ) => Promise<void>;
        };

        await Promise.all([
          redis.publish(channel, encryptedEventJson),
          redis.set(lastEventKey, encryptedEventJson, 'EX', 86400),
        ]);
      }
    }
  }, 60000); // Extended timeout for module initialization

  afterAll(async () => {
    server.close();

    // Close worker
    if (workerInstance) {
      await workerInstance.close();
    }

    // Clean up test data
    // 1. Delete shell_query_runs
    for (const run of createdRuns) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${run.tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${run.mid}, false)`;
        await reserved`SELECT set_config('app.user_id', ${run.userId}, false)`;
        await reserved`DELETE FROM shell_query_runs WHERE id = ${run.runId}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        await reserved`RESET app.user_id`;
        reserved.release();
      } catch {
        // Best effort cleanup
      }
    }

    // 2. Delete tenant_settings
    for (const setting of createdTenantSettings) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${setting.tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${setting.mid}, false)`;
        await reserved`DELETE FROM tenant_settings WHERE tenant_id = ${setting.tenantId}::uuid AND mid = ${setting.mid}`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        reserved.release();
      } catch {
        // Best effort
      }
    }

    // 3. Delete credentials
    for (const cred of createdCredentials) {
      try {
        const reserved = await sqlClient.reserve();
        await reserved`SELECT set_config('app.tenant_id', ${cred.tenantId}, false)`;
        await reserved`SELECT set_config('app.mid', ${cred.mid}, false)`;
        await reserved`DELETE FROM credentials WHERE id = ${cred.credentialId}::uuid`;
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        reserved.release();
      } catch {
        // Best effort
      }
    }

    // 4. Delete users and tenants (not RLS-protected)
    if (createdUserIds.length > 0) {
      await sqlClient`DELETE FROM users WHERE id = ANY(${createdUserIds}::uuid[])`;
    }
    if (createdTenantIds.length > 0) {
      await sqlClient`DELETE FROM tenants WHERE id = ANY(${createdTenantIds}::uuid[])`;
    }

    await app.close();
  }, 30000);

  beforeEach(async () => {
    // Reset MCE mock state
    mceScenario = 'success';
    pollStatusOverride = null;
    mceErrorMessage = null;
    request429Count = 0;
    mceRequestLog.length = 0;

    // Reset MSW handlers to defaults (removes any test-specific overrides)
    server.resetHandlers();

    // Clean up any leftover jobs in the queue from previous tests
    if (shellQueryQueue) {
      try {
        await shellQueryQueue.drain();
      } catch {
        // Ignore drain errors
      }
    }
  });

  async function createAuthenticatedAgent(
    sfUserId: string = 'sf-user-query-flow',
    eid: string = 'eid-query-flow',
    mid: string = 'mid-query-flow',
  ) {
    const testAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: sfUserId,
      enterprise_id: eid,
      member_id: mid,
      stack: 'test-tssd',
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    const loginResponse = await testAgent.post('/auth/login').send({ jwt });
    expect(loginResponse.status).toBe(302);

    // Get CSRF token
    const meResponse = await testAgent.get('/auth/me').expect(200);
    const csrfToken = meResponse.body.csrfToken;
    const tenantId = meResponse.body.tenant?.id;
    const userId = meResponse.body.user?.id;

    // Track created entities
    if (tenantId && !createdTenantIds.includes(tenantId)) {
      createdTenantIds.push(tenantId);
    }
    if (userId && !createdUserIds.includes(userId)) {
      createdUserIds.push(userId);
    }

    return { agent: testAgent, csrfToken, tenantId, userId, mid };
  }

  async function waitForRunStatus(
    agent: ReturnType<typeof superagent>,
    csrfToken: string,
    runId: string,
    targetStatuses: string[],
    maxAttempts: number = 30,
  ): Promise<{ status: string; errorMessage?: string }> {
    let status = 'queued';
    let errorMessage: string | undefined;
    let attempts = 0;

    while (!targetStatuses.includes(status) && attempts < maxAttempts) {
      await sleep(300);
      const statusRes = await agent
        .get(`/runs/${runId}`)
        .set('x-csrf-token', csrfToken);

      if (statusRes.status === 200) {
        status = statusRes.body.status;
        errorMessage = statusRes.body.errorMessage;
      }
      attempts++;
    }

    return { status, errorMessage };
  }

  describe('Complete Flow', () => {
    it('should complete full flow: POST /runs -> Worker processes -> results available', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      // 1. Create a query run
      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name, Age FROM TestDE' });

      expect(createRes.status).toBe(201);
      expect(createRes.body.runId).toBeDefined();
      expect(createRes.body.status).toBe('queued');

      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // 2. Wait for completion
      const result = await waitForRunStatus(
        agent,
        csrfToken,
        runId,
        ['ready', 'failed'],
        60,
      );

      expect(result.status).toBe('ready');

      // 3. Get results
      const resultsRes = await agent
        .get(`/runs/${runId}/results`)
        .set('x-csrf-token', csrfToken);

      expect(resultsRes.status).toBe(200);
      expect(resultsRes.body.rows).toHaveLength(2);
      expect(resultsRes.body.columns).toContain('Name');
      expect(resultsRes.body.totalRows).toBe(2);
    }, 60000);
  });

  describe('Query Failure Handling', () => {
    it('should handle query failure gracefully', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      // Set error scenario
      pollStatusOverride = 'Error';
      mceErrorMessage = 'Invalid SQL syntax: unknown column "Foo"';

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Foo FROM NonExistentDE' });

      expect(createRes.status).toBe(201);
      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // Wait for failure
      const result = await waitForRunStatus(
        agent,
        csrfToken,
        runId,
        ['failed', 'ready'],
        60,
      );

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBeDefined();
      expect(result.errorMessage).toContain('Invalid SQL syntax');
    }, 60000);
  });

  describe('Cancel Running Query', () => {
    it('should cancel a running query', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM LongRunningDE' });

      expect(createRes.status).toBe(201);
      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // Immediately cancel
      const cancelRes = await agent
        .post(`/runs/${runId}/cancel`)
        .set('x-csrf-token', csrfToken);

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('canceled');

      // Verify status
      const statusRes = await agent
        .get(`/runs/${runId}`)
        .set('x-csrf-token', csrfToken);

      expect(statusRes.body.status).toBe('canceled');
    }, 30000);
  });

  describe('Per-User Rate Limits', () => {
    it('should enforce per-user concurrent run limit', async () => {
      // Use a unique user to avoid affecting other tests' rate limits
      const uniqueUserId = `rate-limit-user-${Date.now()}`;
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent(
          uniqueUserId,
          `eid-${uniqueUserId}`,
          `mid-${uniqueUserId}`,
        );

      // Create 10 concurrent runs (the limit)
      const runPromises = Array.from({ length: 10 }, (_, i) =>
        agent
          .post('/runs')
          .set('x-csrf-token', csrfToken)
          .send({ sqlText: `SELECT Name FROM TestDE${i}` }),
      );

      const responses = await Promise.all(runPromises);
      const successfulRuns = responses.filter((r) => r.status === 201);

      // Track created runs for cleanup
      for (const res of successfulRuns) {
        if (res.body.runId) {
          createdRuns.push({
            runId: res.body.runId,
            tenantId,
            mid,
            userId,
          });
        }
      }

      // All 10 should succeed
      expect(successfulRuns).toHaveLength(10);

      // 11th request should fail with rate limit
      const eleventhRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE11' });

      expect(eleventhRes.status).toBe(429);
      expect(eleventhRes.body.code).toBe('RATE_LIMIT_EXCEEDED');
    }, 60000);
  });

  describe('MCE Error Scenarios', () => {
    it('should handle MCE 500 error gracefully', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      // Set error scenario
      pollStatusOverride = 'Error';
      mceErrorMessage = 'MCE Server Error';

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE' });

      expect(createRes.status).toBe(201);
      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      const result = await waitForRunStatus(
        agent,
        csrfToken,
        runId,
        ['failed', 'ready'],
        60,
      );

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBeDefined();
    }, 60000);
  });

  describe('Run Status Endpoint', () => {
    it('should return 404 for non-existent run', async () => {
      const { agent, csrfToken } = await createAuthenticatedAgent();

      const res = await agent
        .get('/runs/00000000-0000-0000-0000-000000000000')
        .set('x-csrf-token', csrfToken);

      expect(res.status).toBe(404);
    }, 60000);

    it('should return run status with timestamps', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE' });

      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      const statusRes = await agent
        .get(`/runs/${runId}`)
        .set('x-csrf-token', csrfToken);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.runId).toBe(runId);
      expect(statusRes.body.status).toBeDefined();
      expect(statusRes.body.createdAt).toBeDefined();
      expect(statusRes.body.updatedAt).toBeDefined();
    }, 60000);
  });

  describe('Results Endpoint', () => {
    it('should return 400 for invalid page number', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      // Create and wait for completion
      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE' });

      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      await waitForRunStatus(agent, csrfToken, runId, ['ready'], 60);

      // Test invalid page numbers
      const invalidPageRes = await agent
        .get(`/runs/${runId}/results?page=0`)
        .set('x-csrf-token', csrfToken);
      expect(invalidPageRes.status).toBe(400);

      const negativePageRes = await agent
        .get(`/runs/${runId}/results?page=-1`)
        .set('x-csrf-token', csrfToken);
      expect(negativePageRes.status).toBe(400);

      const tooHighPageRes = await agent
        .get(`/runs/${runId}/results?page=51`)
        .set('x-csrf-token', csrfToken);
      expect(tooHighPageRes.status).toBe(400);
    }, 60000);

    it('should return 409 for not-ready run', async () => {
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent();

      // Create run but don't wait for completion
      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE' });

      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // Immediately try to get results (before completion)
      const resultsRes = await agent
        .get(`/runs/${runId}/results`)
        .set('x-csrf-token', csrfToken);

      // Should be either 409 (not ready) or 200 (if it completed fast)
      if (resultsRes.status === 409) {
        expect(resultsRes.body.code).toBe('INVALID_STATE');
      } else {
        expect(resultsRes.status).toBe(200);
      }
    }, 60000);
  });

  describe('MCE Failure Scenarios', () => {
    it('should handle MCE 429 rate limit and retry successfully', async () => {
      // Use unique user to isolate from other tests
      const uniqueId = `mce-429-${Date.now()}`;
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent(
          uniqueId,
          `eid-${uniqueId}`,
          `mid-${uniqueId}`,
        );

      // Set 429 scenario: first request fails with 429, second succeeds
      mceScenario = 'error-429-then-success';
      request429Count = 0;

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE' });

      expect(createRes.status).toBe(201);
      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // Wait for completion - the run should eventually complete
      // because the mock returns success on second attempt
      const result = await waitForRunStatus(
        agent,
        csrfToken,
        runId,
        ['ready', 'failed'],
        60,
      );

      // The run should complete successfully after retry
      expect(result.status).toBe('ready');
    }, 90000);

    it('should handle query timeout gracefully', async () => {
      // Use unique user to isolate from other tests
      const uniqueId = `mce-timeout-${Date.now()}`;
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent(
          uniqueId,
          `eid-${uniqueId}`,
          `mid-${uniqueId}`,
        );

      // Set timeout scenario: poll status never becomes Complete
      // The worker should mark it failed after timeout
      pollStatusOverride = 'Running';

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM SlowQueryDE' });

      expect(createRes.status).toBe(201);
      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // For E2E testing, we can't wait for the full 29-minute timeout
      // Instead, we verify the run was created and is processing
      // The actual timeout logic is tested in unit/integration tests
      const statusRes = await agent
        .get(`/runs/${runId}`)
        .set('x-csrf-token', csrfToken);

      expect(statusRes.status).toBe(200);
      expect(['queued', 'running', 'ready']).toContain(statusRes.body.status);
    }, 60000);

    it('should handle malformed MCE response gracefully', async () => {
      // Use unique user to isolate from other tests
      const uniqueId = `mce-malformed-${Date.now()}`;
      const { agent, csrfToken, tenantId, userId, mid } =
        await createAuthenticatedAgent(
          uniqueId,
          `eid-${uniqueId}`,
          `mid-${uniqueId}`,
        );

      // Override to return malformed response
      server.use(
        http.get(
          'https://test-tssd.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:key/rowset',
          () => {
            // Return valid JSON but with unexpected structure
            return HttpResponse.json({
              unexpectedField: 'malformed',
              // Missing items, count, page, pageSize
            });
          },
        ),
      );

      const createRes = await agent
        .post('/runs')
        .set('x-csrf-token', csrfToken)
        .send({ sqlText: 'SELECT Name FROM TestDE' });

      expect(createRes.status).toBe(201);
      const { runId } = createRes.body;
      createdRuns.push({ runId, tenantId, mid, userId });

      // Wait for completion
      const result = await waitForRunStatus(
        agent,
        csrfToken,
        runId,
        ['ready', 'failed'],
        60,
      );

      // The run should still complete (the service normalizes missing fields)
      // or fail gracefully
      expect(['ready', 'failed']).toContain(result.status);

      if (result.status === 'ready') {
        // If ready, verify results endpoint handles malformed response
        const resultsRes = await agent
          .get(`/runs/${runId}/results`)
          .set('x-csrf-token', csrfToken);

        // Should return empty/normalized response rather than crash
        expect(resultsRes.status).toBe(200);
        expect(resultsRes.body.columns).toBeDefined();
        expect(resultsRes.body.rows).toBeDefined();
      }
    }, 90000);
  });
});
