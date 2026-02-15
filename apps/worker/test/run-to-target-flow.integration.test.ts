/**
 * RunToTargetFlow Integration Tests
 *
 * Tests the complete RunToTargetFlow execution with real infrastructure.
 *
 * Test Strategy:
 * - Real NestJS TestingModule with actual MCE services (via MceBridge)
 * - Real PostgreSQL database for tenant_settings (cached folder ID)
 * - Stub MceAuthProvider (provides TSSD for SOAP/REST URL construction)
 * - MSW for MCE SOAP/REST requests (external boundary only)
 * - Behavioral assertions via MSW request capture and database state
 *
 * Covered Behaviors:
 * - Happy path: validation -> target DE retrieval -> schema check -> QD creation -> Perform
 * - Target DE not found error
 * - Schema mismatch error (columns don't match target DE)
 * - Self-overwrite blocked error
 * - Query validation failure
 */
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  DatabaseModule,
  ErrorCode,
  LoggerModule,
  MCE_AUTH_PROVIDER,
  type MceAuthProvider,
  MceModule,
  RlsContextService,
  validateWorkerEnv,
} from '@qpp/backend-shared';
import { externalOnlyOnUnhandledRequest, resetFactories } from '@qpp/test-utils';
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

import { MceQueryValidator } from '../src/shell-query/mce-query-validator';
import { RunToTargetFlow } from '../src/shell-query/strategies/run-to-target.strategy';
import type { ShellQueryJob } from '../src/shell-query/shell-query.types';

// Test constants
const TEST_TSSD = 'rtt-integration-tssd';
const TEST_TENANT_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_MID = `mid-rtt-${Date.now()}`;
const TEST_EID = `eid-rtt-${Date.now()}`;

// Track MSW requests for verification
interface CapturedRequest {
  type: 'SOAP' | 'REST';
  action?: string;
  body?: string;
  url?: string;
}
const capturedRequests: CapturedRequest[] = [];

// Stub auth provider (provides TSSD for URL construction)
function createStubAuthProvider(): MceAuthProvider {
  return {
    refreshToken: async () => ({
      accessToken: 'test-access-token',
      tssd: TEST_TSSD,
    }),
    invalidateToken: async () => {},
  };
}

// Helper to detect SOAP request type from body
function detectSoapRequestType(body: string): string {
  if (body.includes('<ObjectType>DataFolder</ObjectType>')) return 'DataFolder-Retrieve';
  if (body.includes('<Objects xsi:type="DataFolder"')) return 'DataFolder-Create';
  if (body.includes('<ObjectType>DataExtension</ObjectType>')) return 'DataExtension-Retrieve';
  if (body.includes('<Objects xsi:type="DataExtension"')) {
    if (body.includes('DeleteRequest')) return 'DataExtension-Delete';
    return 'DataExtension-Create';
  }
  if (body.includes('DataExtensionField')) return 'DataExtensionField-Retrieve';
  if (body.includes('<ObjectType>QueryDefinition</ObjectType>')) return 'QueryDefinition-Retrieve';
  if (body.includes('<Objects xsi:type="QueryDefinition"')) {
    if (body.includes('DeleteRequest')) return 'QueryDefinition-Delete';
    return 'QueryDefinition-Create';
  }
  if (body.includes('PerformRequest') && body.includes('QueryDefinition')) return 'QueryDefinition-Perform';
  return 'Unknown';
}

// Build test SOAP responses
function buildRetrieveDataFolderResponse(folders: Array<{ id: number; name: string }>): string {
  const results = folders
    .map(
      (f) => `
      <Results xsi:type="DataFolder" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <ID>${f.id}</ID>
        <Name>${f.name}</Name>
        <ContentType>dataextension</ContentType>
      </Results>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <OverallStatus>OK</OverallStatus>
        ${results}
      </RetrieveResponseMsg>
    </soap:Body>
  </soap:Envelope>`;
}

function buildCreateDataFolderResponse(newId: number): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <CreateResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Results>
          <StatusCode>OK</StatusCode>
          <StatusMessage>Created</StatusMessage>
          <NewID>${newId}</NewID>
        </Results>
      </CreateResponse>
    </soap:Body>
  </soap:Envelope>`;
}

function buildEmptyRetrieveResponse(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <OverallStatus>OK</OverallStatus>
      </RetrieveResponseMsg>
    </soap:Body>
  </soap:Envelope>`;
}

function buildCreateQueryDefinitionResponse(objectId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <CreateResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Results>
          <StatusCode>OK</StatusCode>
          <StatusMessage>Created</StatusMessage>
          <NewID>222</NewID>
          <NewObjectID>${objectId}</NewObjectID>
        </Results>
      </CreateResponse>
    </soap:Body>
  </soap:Envelope>`;
}

function buildDeleteResponse(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <DeleteResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Results>
          <StatusCode>OK</StatusCode>
          <StatusMessage>Deleted</StatusMessage>
        </Results>
      </DeleteResponse>
    </soap:Body>
  </soap:Envelope>`;
}

function buildPerformQueryDefinitionResponse(taskId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
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
              <ID>${taskId}</ID>
              <InteractionObjectID>interaction-obj-id</InteractionObjectID>
            </Task>
          </Result>
        </Results>
      </PerformResponseMsg>
    </soap:Body>
  </soap:Envelope>`;
}

function buildRetrieveDataExtensionFieldsResponse(
  fields: Array<{ name: string; fieldType: string; maxLength?: number; isRequired?: boolean }>,
): string {
  const results = fields
    .map(
      (f) => `
      <Results xsi:type="DataExtensionField" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <Name>${f.name}</Name>
        <FieldType>${f.fieldType}</FieldType>
        ${f.maxLength ? `<MaxLength>${f.maxLength}</MaxLength>` : ''}
        ${f.isRequired !== undefined ? `<IsRequired>${f.isRequired}</IsRequired>` : ''}
      </Results>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <OverallStatus>OK</OverallStatus>
        ${results}
      </RetrieveResponseMsg>
    </soap:Body>
  </soap:Envelope>`;
}

function buildRetrieveDataExtensionResponse(de: { name: string; customerKey: string; objectId: string }): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <OverallStatus>OK</OverallStatus>
        <Results xsi:type="DataExtension" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
          <Name>${de.name}</Name>
          <CustomerKey>${de.customerKey}</CustomerKey>
          <ObjectID>${de.objectId}</ObjectID>
        </Results>
      </RetrieveResponseMsg>
    </soap:Body>
  </soap:Envelope>`;
}

// MSW server setup
const server = setupServer();

describe('RunToTargetFlow (integration)', () => {
  let module: TestingModule;
  let runToTargetFlow: RunToTargetFlow;
  let sqlClient: Sql;
  let rlsContext: RlsContextService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: externalOnlyOnUnhandledRequest() });

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateWorkerEnv,
          envFilePath: '../../.env',
        }),
        LoggerModule,
        DatabaseModule,
        MceModule,
      ],
      providers: [RunToTargetFlow, MceQueryValidator],
    })
      .overrideProvider(MCE_AUTH_PROVIDER)
      .useValue(createStubAuthProvider())
      .compile();

    runToTargetFlow = module.get(RunToTargetFlow);
    sqlClient = module.get<Sql>('SQL_CLIENT');
    rlsContext = module.get(RlsContextService);

    // Create test tenant and user
    await sqlClient`
      INSERT INTO tenants (id, eid, tssd)
      VALUES (${TEST_TENANT_ID}::uuid, ${TEST_EID}, ${TEST_TSSD})
      ON CONFLICT (id) DO NOTHING
    `;

    const sfUserId = `sf-rtt-test-${Date.now()}`;
    await sqlClient`
      INSERT INTO users (id, tenant_id, sf_user_id, email, name)
      VALUES (${TEST_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid, ${sfUserId}, 'rtt@test.com', 'RTT Test User')
      ON CONFLICT (id) DO NOTHING
    `;

    // Create credentials with RLS context
    const reserved = await sqlClient.reserve();
    try {
      await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
      await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
      await reserved`
        INSERT INTO credentials (tenant_id, mid, user_id, access_token, refresh_token, expires_at)
        VALUES (
          ${TEST_TENANT_ID}::uuid,
          ${TEST_MID},
          ${TEST_USER_ID}::uuid,
          'enc-access-token',
          'enc-refresh-token',
          ${new Date(Date.now() + 3600000).toISOString()}
        )
        ON CONFLICT DO NOTHING
      `;
    } finally {
      await reserved`RESET app.tenant_id`;
      await reserved`RESET app.mid`;
      reserved.release();
    }
  }, 60000);

  afterAll(async () => {
    server.close();

    // Clean up tenant_settings
    try {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`DELETE FROM tenant_settings WHERE tenant_id = ${TEST_TENANT_ID}::uuid AND mid = ${TEST_MID}`;
      } finally {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        reserved.release();
      }
    } catch {
      // Ignore cleanup errors
    }

    // Clean up credentials
    try {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`DELETE FROM credentials WHERE tenant_id = ${TEST_TENANT_ID}::uuid AND mid = ${TEST_MID}`;
      } finally {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        reserved.release();
      }
    } catch {
      // Ignore cleanup errors
    }

    await sqlClient`DELETE FROM users WHERE id = ${TEST_USER_ID}::uuid`;
    await sqlClient`DELETE FROM tenants WHERE id = ${TEST_TENANT_ID}::uuid`;

    await module.close();
  }, 30000);

  beforeEach(async () => {
    resetFactories();
    server.resetHandlers();
    capturedRequests.length = 0;

    // Clean up tenant_settings before each test
    try {
      const reserved = await sqlClient.reserve();
      try {
        await reserved`SELECT set_config('app.tenant_id', ${TEST_TENANT_ID}, false)`;
        await reserved`SELECT set_config('app.mid', ${TEST_MID}, false)`;
        await reserved`DELETE FROM tenant_settings WHERE tenant_id = ${TEST_TENANT_ID}::uuid AND mid = ${TEST_MID}`;
      } finally {
        await reserved`RESET app.tenant_id`;
        await reserved`RESET app.mid`;
        reserved.release();
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  afterEach(() => {
    server.resetHandlers();
  });

  function createTestJob(overrides: Partial<ShellQueryJob> = {}): ShellQueryJob {
    return {
      runId: overrides.runId ?? crypto.randomUUID(),
      tenantId: overrides.tenantId ?? TEST_TENANT_ID,
      userId: overrides.userId ?? TEST_USER_ID,
      mid: overrides.mid ?? TEST_MID,
      eid: overrides.eid ?? TEST_EID,
      sqlText: overrides.sqlText ?? 'SELECT Name FROM SourceDE',
      targetDeCustomerKey: overrides.targetDeCustomerKey ?? 'TargetDEKey',
      ...overrides,
    };
  }

  async function getTenantSettings(): Promise<{ qppFolderId: number | null } | null> {
    return rlsContext.runWithTenantContext(TEST_TENANT_ID, TEST_MID, async () => {
      const result = await sqlClient`
        SELECT qpp_folder_id FROM tenant_settings
        WHERE tenant_id = ${TEST_TENANT_ID}::uuid AND mid = ${TEST_MID}
      `;
      if (result.length === 0) return null;
      return { qppFolderId: result[0].qpp_folder_id };
    });
  }

  describe('Happy path: execute with targetDeCustomerKey', () => {
    it('should return FlowResult with status "ready" and create QueryDefinition', async () => {
      const runId = crypto.randomUUID();
      const targetDeCustomerKey = 'TargetDEKey';
      const targetDeName = 'Target DE';
      const targetDeObjectId = `de-target-${runId}`;
      const expectedTaskId = `task-${runId}`;
      const expectedQdObjectId = `qd-${runId}`;

      // Configure MSW handlers for happy path
      server.use(
        // REST: Query validation
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            capturedRequests.push({ type: 'REST', action: 'validate' });
            return HttpResponse.json({ queryValid: true });
          },
        ),

        // SOAP: All MCE operations
        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });

          switch (requestType) {
            case 'DataExtension-Retrieve':
              // Return target DE when querying by CustomerKey
              if (body.includes('TargetDEKey') || body.includes(targetDeCustomerKey)) {
                return HttpResponse.xml(
                  buildRetrieveDataExtensionResponse({
                    name: targetDeName,
                    customerKey: targetDeCustomerKey,
                    objectId: targetDeObjectId,
                  }),
                );
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtensionField-Retrieve':
              // Return fields that match the query's output (Name column)
              return HttpResponse.xml(
                buildRetrieveDataExtensionFieldsResponse([
                  { name: 'Name', fieldType: 'Text', maxLength: 254 },
                ]),
              );

            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              if (body.includes('Data Extensions')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 1, name: 'Data Extensions' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataFolder-Create':
              return HttpResponse.xml(buildCreateDataFolderResponse(12345));

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(expectedQdObjectId));

            case 'QueryDefinition-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(expectedTaskId));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({
        runId,
        sqlText: 'SELECT Name FROM SourceDE',
        targetDeCustomerKey,
      });
      const result = await runToTargetFlow.execute(job);

      // Verify flow result
      expect(result.status).toBe('ready');
      expect(result.taskId).toBe(expectedTaskId);
      expect(result.queryDefinitionId).toBe(expectedQdObjectId);
      expect(result.queryCustomerKey).toContain('QPP_Query_');
      expect(result.targetDeCustomerKey).toBe(targetDeCustomerKey);

      // Verify MCE calls sequence
      expect(capturedRequests.some((r) => r.type === 'REST' && r.action === 'validate')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'DataExtension-Retrieve')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'QueryDefinition-Create')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'QueryDefinition-Perform')).toBe(true);

      // Verify folder ID was cached in database
      const settings = await getTenantSettings();
      expect(settings?.qppFolderId).toBe(12345);
    });
  });

  describe('Target DE not found', () => {
    it('should throw AppError with code RESOURCE_NOT_FOUND when target DE does not exist', async () => {
      const runId = crypto.randomUUID();

      // Configure MSW: target DE not found
      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            capturedRequests.push({ type: 'REST', action: 'validate' });
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });

          switch (requestType) {
            case 'DataExtension-Retrieve':
              // Return empty - target DE not found
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({
        runId,
        sqlText: 'SELECT Name FROM SourceDE',
        targetDeCustomerKey: 'NonExistentDE',
      });

      await expect(runToTargetFlow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });

      // Verify no QD create/perform was attempted
      expect(capturedRequests.filter((r) => r.action === 'QueryDefinition-Create').length).toBe(0);
      expect(capturedRequests.filter((r) => r.action === 'QueryDefinition-Perform').length).toBe(0);
    });
  });

  describe('Schema mismatch (columns do not match)', () => {
    it('should throw AppError with code MCE_VALIDATION_FAILED when SQL column missing in target DE', async () => {
      const runId = crypto.randomUUID();
      const targetDeCustomerKey = 'TargetDEKey';
      const targetDeName = 'Target DE';
      const targetDeObjectId = `de-target-${runId}`;

      // Configure MSW: target DE exists but fields don't match
      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            capturedRequests.push({ type: 'REST', action: 'validate' });
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });

          switch (requestType) {
            case 'DataExtension-Retrieve':
              // Always return the target DE for this test
              return HttpResponse.xml(
                buildRetrieveDataExtensionResponse({
                  name: targetDeName,
                  customerKey: targetDeCustomerKey,
                  objectId: targetDeObjectId,
                }),
              );

            case 'DataExtensionField-Retrieve':
              // Return fields that do NOT include 'Email' (which query selects)
              // Only return 'SubscriberKey' - mismatch with query's Email column
              return HttpResponse.xml(
                buildRetrieveDataExtensionFieldsResponse([
                  { name: 'SubscriberKey', fieldType: 'Text', maxLength: 254 },
                ]),
              );

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({
        runId,
        sqlText: 'SELECT Email FROM SourceDE',
        targetDeCustomerKey,
        tableMetadata: {
          SourceDE: [{ Name: 'Email', FieldType: 'EmailAddress', MaxLength: 254 }],
        },
      });

      const error = await runToTargetFlow.execute(job).catch((e) => e);

      expect(error.code).toBe(ErrorCode.MCE_VALIDATION_FAILED);
      expect(error.extensions?.violations).toBeDefined();
      expect(error.extensions?.violations?.length).toBeGreaterThan(0);

      // Verify no QD create/perform was attempted
      expect(capturedRequests.filter((r) => r.action === 'QueryDefinition-Create').length).toBe(0);
      expect(capturedRequests.filter((r) => r.action === 'QueryDefinition-Perform').length).toBe(0);
    });
  });

  describe('Self-overwrite blocked', () => {
    it('should throw AppError with code MCE_BAD_REQUEST when query reads from target DE', async () => {
      const runId = crypto.randomUUID();
      const targetDeCustomerKey = 'TargetDEKey';
      const targetDeName = 'Target DE';
      const targetDeObjectId = `de-target-${runId}`;

      // Configure MSW: target DE exists
      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            capturedRequests.push({ type: 'REST', action: 'validate' });
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });

          switch (requestType) {
            case 'DataExtension-Retrieve':
              if (body.includes('TargetDEKey') || body.includes(targetDeCustomerKey)) {
                return HttpResponse.xml(
                  buildRetrieveDataExtensionResponse({
                    name: targetDeName,
                    customerKey: targetDeCustomerKey,
                    objectId: targetDeObjectId,
                  }),
                );
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      // SQL reads from the same DE that is the target (self-overwrite)
      const job = createTestJob({
        runId,
        sqlText: 'SELECT SubscriberKey FROM [Target DE]',
        targetDeCustomerKey,
      });

      await expect(runToTargetFlow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST,
      });

      // Verify no QD create/perform was attempted
      expect(capturedRequests.filter((r) => r.action === 'QueryDefinition-Create').length).toBe(0);
      expect(capturedRequests.filter((r) => r.action === 'QueryDefinition-Perform').length).toBe(0);
    });
  });

  describe('Query validation failure', () => {
    it('should throw AppError with code MCE_VALIDATION_FAILED when MCE rejects the query', async () => {
      const runId = crypto.randomUUID();

      // Configure MSW: query validation fails
      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            capturedRequests.push({ type: 'REST', action: 'validate' });
            return HttpResponse.json({
              queryValid: false,
              errorMessage: 'Invalid syntax near SELECT',
            });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });
          return HttpResponse.xml(buildEmptyRetrieveResponse());
        }),
      );

      const job = createTestJob({
        runId,
        sqlText: 'INVALID QUERY SYNTAX',
        targetDeCustomerKey: 'TargetDEKey',
      });

      const error = await runToTargetFlow.execute(job).catch((e) => e);

      expect(error.code).toBe(ErrorCode.MCE_VALIDATION_FAILED);
      expect(error.extensions?.violations).toBeDefined();

      // Verify only validation was called, no SOAP operations
      expect(capturedRequests.filter((r) => r.type === 'REST' && r.action === 'validate').length).toBe(1);
      expect(capturedRequests.filter((r) => r.type === 'SOAP').length).toBe(0);
    });
  });
});
