/**
 * RunToTempFlow Integration Tests
 *
 * Tests the complete RunToTempFlow execution with real infrastructure.
 *
 * Test Strategy:
 * - Real NestJS TestingModule with actual MCE services (via MceBridge)
 * - Real PostgreSQL database for tenant_settings (cached folder ID)
 * - Stub MceAuthProvider (provides TSSD for SOAP/REST URL construction)
 * - MSW for MCE SOAP/REST requests (external boundary only)
 * - Behavioral assertions via MSW request capture and database state
 *
 * Covered Behaviors:
 * - Full flow: validation -> folder retrieval/creation -> DE creation -> QD creation -> Perform
 * - Cached folder ID reuse from tenant_settings table
 * - Query validation failure stops execution
 * - Error handling for MCE SOAP failures
 * - SELECT * expansion with metadata fetching
 */
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { resetFactories } from '@qpp/test-utils';
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
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import type { ShellQueryJob } from '../src/shell-query/shell-query.types';

// Test constants
const TEST_TSSD = 'rtf-integration-tssd';
const TEST_TENANT_ID = crypto.randomUUID();
const TEST_USER_ID = crypto.randomUUID();
const TEST_MID = `mid-rtf-${Date.now()}`;
const TEST_EID = `eid-rtf-${Date.now()}`;

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

function buildCreateDataExtensionResponse(objectId: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <CreateResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Results>
          <StatusCode>OK</StatusCode>
          <StatusMessage>Created</StatusMessage>
          <NewID>111</NewID>
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

function buildSoapErrorResponse(operation: string, statusCode: string, message: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
      <CreateResponse xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <Results>
          <StatusCode>${statusCode}</StatusCode>
          <StatusMessage>${message}</StatusMessage>
        </Results>
      </CreateResponse>
    </soap:Body>
  </soap:Envelope>`;
}

function buildRetrieveDataExtensionFieldsResponse(
  fields: Array<{ name: string; fieldType: string; maxLength?: number }>,
): string {
  const results = fields
    .map(
      (f) => `
      <Results xsi:type="DataExtensionField" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <Name>${f.name}</Name>
        <FieldType>${f.fieldType}</FieldType>
        ${f.maxLength ? `<MaxLength>${f.maxLength}</MaxLength>` : ''}
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

describe('RunToTempFlow (integration)', () => {
  let module: TestingModule;
  let runToTempFlow: RunToTempFlow;
  let sqlClient: Sql;
  let rlsContext: RlsContextService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });

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
      providers: [RunToTempFlow, MceQueryValidator],
    })
      .overrideProvider(MCE_AUTH_PROVIDER)
      .useValue(createStubAuthProvider())
      .compile();

    runToTempFlow = module.get(RunToTempFlow);
    sqlClient = module.get<Sql>('SQL_CLIENT');
    rlsContext = module.get(RlsContextService);

    // Create test tenant and user
    await sqlClient`
      INSERT INTO tenants (id, eid, tssd)
      VALUES (${TEST_TENANT_ID}::uuid, ${TEST_EID}, ${TEST_TSSD})
      ON CONFLICT (id) DO NOTHING
    `;

    const sfUserId = `sf-rtf-test-${Date.now()}`;
    await sqlClient`
      INSERT INTO users (id, tenant_id, sf_user_id, email, name)
      VALUES (${TEST_USER_ID}::uuid, ${TEST_TENANT_ID}::uuid, ${sfUserId}, 'rtf@test.com', 'RTF Test User')
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
      sqlText: overrides.sqlText ?? 'SELECT Name FROM TestDE',
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

  describe('Full flow execution', () => {
    it('should execute complete flow: validation -> folder -> DE -> QD -> Perform', async () => {
      const runId = crypto.randomUUID();
      const expectedTaskId = `task-${runId}`;
      const expectedDeObjectId = `de-${runId}`;
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
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              if (body.includes('Data Extensions')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 1, name: 'Data Extensions' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(expectedDeObjectId));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

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

      const job = createTestJob({ runId, sqlText: 'SELECT Name FROM TestDE' });
      const result = await runToTempFlow.execute(job);

      // Verify flow result
      expect(result.status).toBe('ready');
      expect(result.taskId).toBe(expectedTaskId);
      expect(result.queryDefinitionId).toBe(expectedQdObjectId);
      expect(result.queryCustomerKey).toContain('QPP_Query_');
      expect(result.queryCustomerKey).toContain(TEST_USER_ID.substring(0, 26)); // userId-based key
      expect(result.targetDeName).toContain('QPP_');

      // Verify MCE calls sequence
      expect(capturedRequests.some((r) => r.type === 'REST' && r.action === 'validate')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'DataFolder-Retrieve')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'DataExtension-Create')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'QueryDefinition-Create')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'QueryDefinition-Perform')).toBe(true);

      // Verify folder ID was cached in database
      const settings = await getTenantSettings();
      expect(settings?.qppFolderId).toBe(12345);
    });

    it('should create folder when QueryPlusPlus Results folder does not exist', async () => {
      const runId = crypto.randomUUID();
      const newFolderId = 99999;

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
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                // QPP folder doesn't exist
                return HttpResponse.xml(buildEmptyRetrieveResponse());
              }
              if (body.includes('Data Extensions')) {
                // Root folder exists
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 1, name: 'Data Extensions' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataFolder-Create':
              return HttpResponse.xml(buildCreateDataFolderResponse(newFolderId));

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${runId}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(`qd-${runId}`));

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(`task-${runId}`));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({ runId, sqlText: 'SELECT Name FROM TestDE' });
      await runToTempFlow.execute(job);

      // Verify folder was created
      expect(capturedRequests.some((r) => r.action === 'DataFolder-Create')).toBe(true);

      // Verify new folder ID was cached
      const settings = await getTenantSettings();
      expect(settings?.qppFolderId).toBe(newFolderId);
    });
  });

  describe('Cached folder ID reuse', () => {
    it('should use cached folder ID from tenant_settings without MCE lookup', async () => {
      const cachedFolderId = 77777;
      const runId = crypto.randomUUID();

      // Pre-populate tenant_settings with cached folder ID
      await rlsContext.runWithTenantContext(TEST_TENANT_ID, TEST_MID, async () => {
        await sqlClient`
          INSERT INTO tenant_settings (tenant_id, mid, qpp_folder_id)
          VALUES (${TEST_TENANT_ID}::uuid, ${TEST_MID}, ${cachedFolderId})
          ON CONFLICT (tenant_id, mid) DO UPDATE SET qpp_folder_id = ${cachedFolderId}
        `;
      });

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
            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${runId}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(`qd-${runId}`));

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(`task-${runId}`));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({ runId, sqlText: 'SELECT Name FROM TestDE' });
      await runToTempFlow.execute(job);

      // Verify NO DataFolder-Retrieve was called (cached ID used)
      expect(capturedRequests.filter((r) => r.action === 'DataFolder-Retrieve').length).toBe(0);

      // Verify DataExtension was created
      expect(capturedRequests.some((r) => r.action === 'DataExtension-Create')).toBe(true);
    });
  });

  describe('Query validation failure', () => {
    it('should stop execution when MCE query validation fails', async () => {
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
      );

      const job = createTestJob({ sqlText: 'INVALID QUERY SYNTAX' });

      await expect(runToTempFlow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_VALIDATION_FAILED,
      });

      // Verify only validation was called, no other MCE operations
      expect(capturedRequests.filter((r) => r.type === 'REST' && r.action === 'validate').length).toBe(1);
      expect(capturedRequests.filter((r) => r.type === 'SOAP').length).toBe(0);
    });
  });

  describe('MCE SOAP error handling', () => {
    it('should throw when DataExtension creation fails', async () => {
      const runId = crypto.randomUUID();

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);

          switch (requestType) {
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'DataExtension-Create':
              // Return error response
              return HttpResponse.xml(buildSoapErrorResponse('Create', 'Error', 'Data Extension name already exists'));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({ runId, sqlText: 'SELECT Name FROM TestDE' });

      await expect(runToTempFlow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_SOAP_FAILURE,
      });
    });

    it('should throw when QueryDefinition creation fails', async () => {
      const runId = crypto.randomUUID();

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);

          switch (requestType) {
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${runId}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              // Return error response
              return HttpResponse.xml(buildSoapErrorResponse('Create', 'Error', 'Invalid SQL syntax in QueryDefinition'));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({ runId, sqlText: 'SELECT Name FROM TestDE' });

      await expect(runToTempFlow.execute(job)).rejects.toMatchObject({
        code: ErrorCode.MCE_SOAP_FAILURE,
      });
    });
  });

  describe('SELECT * expansion', () => {
    it('should expand SELECT * using MCE metadata', async () => {
      const runId = crypto.randomUUID();

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });

          switch (requestType) {
            case 'DataExtension-Retrieve':
              if (body.includes('SourceDE')) {
                return HttpResponse.xml(
                  buildRetrieveDataExtensionResponse({
                    name: 'SourceDE',
                    customerKey: 'SourceDE',
                    objectId: 'source-de-obj-id',
                  }),
                );
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtensionField-Retrieve':
              return HttpResponse.xml(
                buildRetrieveDataExtensionFieldsResponse([
                  { name: 'SubscriberKey', fieldType: 'Text', maxLength: 254 },
                  { name: 'Email', fieldType: 'EmailAddress', maxLength: 254 },
                  { name: 'Age', fieldType: 'Number' },
                ]),
              );

            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${runId}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(`qd-${runId}`));

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(`task-${runId}`));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({ runId, sqlText: 'SELECT * FROM SourceDE' });
      const result = await runToTempFlow.execute(job);

      // Verify flow completed successfully
      expect(result.status).toBe('ready');

      // Verify metadata was fetched for SELECT * expansion
      expect(capturedRequests.some((r) => r.action === 'DataExtension-Retrieve')).toBe(true);
      expect(capturedRequests.some((r) => r.action === 'DataExtensionField-Retrieve')).toBe(true);
    });
  });

  describe('Existing resources cleanup', () => {
    it('should delete existing QueryDefinition before creating new one', async () => {
      const runId = crypto.randomUUID();
      const existingQdObjectId = 'existing-qd-object-id';

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);
          capturedRequests.push({ type: 'SOAP', action: requestType, body });

          switch (requestType) {
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${runId}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              // Return existing QD
              return HttpResponse.xml(`<?xml version="1.0" encoding="utf-8"?>
              <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                  <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
                    <OverallStatus>OK</OverallStatus>
                    <Results xsi:type="QueryDefinition" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
                      <ObjectID>${existingQdObjectId}</ObjectID>
                      <CustomerKey>QPP_Query_${runId}</CustomerKey>
                      <Name>QPP_Query_${runId}</Name>
                    </Results>
                  </RetrieveResponseMsg>
                </soap:Body>
              </soap:Envelope>`);

            case 'QueryDefinition-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(`qd-${runId}`));

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(`task-${runId}`));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      const job = createTestJob({ runId, sqlText: 'SELECT Name FROM TestDE' });
      const result = await runToTempFlow.execute(job);

      expect(result.status).toBe('ready');

      // Verify delete was called before create
      const deleteIndex = capturedRequests.findIndex((r) => r.action === 'QueryDefinition-Delete');
      const createIndex = capturedRequests.findIndex((r) => r.action === 'QueryDefinition-Create');
      expect(deleteIndex).toBeGreaterThan(-1);
      expect(createIndex).toBeGreaterThan(-1);
      expect(deleteIndex).toBeLessThan(createIndex);
    });
  });

  describe('Query Activity reuse', () => {
    it('should reuse Query Activity for same user across runs (userId-based key)', async () => {
      const runId1 = crypto.randomUUID();
      const runId2 = crypto.randomUUID();

      // Track QD customerKeys used in create requests
      const qdCustomerKeys: string[] = [];

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);

          // Extract customerKey from QD create request
          if (requestType === 'QueryDefinition-Create') {
            const keyMatch = body.match(/<CustomerKey>([^<]+)<\/CustomerKey>/);
            if (keyMatch) {
              qdCustomerKeys.push(keyMatch[1]);
            }
          }

          switch (requestType) {
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${Date.now()}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(`qd-${Date.now()}`));

            case 'QueryDefinition-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(`task-${Date.now()}`));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      // Execute first run
      const job1 = createTestJob({ runId: runId1, sqlText: 'SELECT Name FROM TestDE' });
      const result1 = await runToTempFlow.execute(job1);

      // Execute second run with SAME user but DIFFERENT runId
      const job2 = createTestJob({ runId: runId2, sqlText: 'SELECT Email FROM TestDE' });
      const result2 = await runToTempFlow.execute(job2);

      // Both runs should use the SAME Query Activity customerKey (based on userId)
      expect(qdCustomerKeys.length).toBe(2);
      expect(qdCustomerKeys[0]).toBe(qdCustomerKeys[1]);
      expect(qdCustomerKeys[0]).toContain('QPP_Query_');
      expect(qdCustomerKeys[0]).toContain(TEST_USER_ID.substring(0, 26));

      // Both results should have the same queryCustomerKey
      expect(result1.queryCustomerKey).toBe(result2.queryCustomerKey);

      // But temp DE names should be DIFFERENT (runId-based, no collision)
      expect(result1.targetDeName).not.toBe(result2.targetDeName);
      expect(result1.targetDeName).toContain(runId1.substring(0, 8));
      expect(result2.targetDeName).toContain(runId2.substring(0, 8));
    });

    it('should use different Query Activity keys for different users', async () => {
      const user1Id = crypto.randomUUID();
      const user2Id = crypto.randomUUID();

      // Track QD customerKeys used in create requests
      const qdCustomerKeys: string[] = [];

      server.use(
        http.post(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/actions/validate/`,
          async () => {
            return HttpResponse.json({ queryValid: true });
          },
        ),

        http.post(`https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`, async ({ request }) => {
          const body = await request.text();
          const requestType = detectSoapRequestType(body);

          // Extract customerKey from QD create request
          if (requestType === 'QueryDefinition-Create') {
            const keyMatch = body.match(/<CustomerKey>([^<]+)<\/CustomerKey>/);
            if (keyMatch) {
              qdCustomerKeys.push(keyMatch[1]);
            }
          }

          switch (requestType) {
            case 'DataFolder-Retrieve':
              if (body.includes('QueryPlusPlus Results')) {
                return HttpResponse.xml(buildRetrieveDataFolderResponse([{ id: 12345, name: 'QueryPlusPlus Results' }]));
              }
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'DataExtension-Create':
              return HttpResponse.xml(buildCreateDataExtensionResponse(`de-${Date.now()}`));

            case 'DataExtension-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Retrieve':
              return HttpResponse.xml(buildEmptyRetrieveResponse());

            case 'QueryDefinition-Create':
              return HttpResponse.xml(buildCreateQueryDefinitionResponse(`qd-${Date.now()}`));

            case 'QueryDefinition-Delete':
              return HttpResponse.xml(buildDeleteResponse());

            case 'QueryDefinition-Perform':
              return HttpResponse.xml(buildPerformQueryDefinitionResponse(`task-${Date.now()}`));

            default:
              return HttpResponse.xml(buildEmptyRetrieveResponse());
          }
        }),
      );

      // Execute run for user 1
      const job1 = createTestJob({ userId: user1Id, sqlText: 'SELECT Name FROM TestDE' });
      const result1 = await runToTempFlow.execute(job1);

      // Execute run for user 2
      const job2 = createTestJob({ userId: user2Id, sqlText: 'SELECT Name FROM TestDE' });
      const result2 = await runToTempFlow.execute(job2);

      // Different users should have DIFFERENT Query Activity customerKeys
      expect(qdCustomerKeys.length).toBe(2);
      expect(qdCustomerKeys[0]).not.toBe(qdCustomerKeys[1]);
      expect(result1.queryCustomerKey).not.toBe(result2.queryCustomerKey);
      expect(result1.queryCustomerKey).toContain(user1Id.substring(0, 26));
      expect(result2.queryCustomerKey).toContain(user2Id.substring(0, 26));
    });
  });
});
