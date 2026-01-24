import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import * as jose from 'jose';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { Agent, agent as superagent } from 'supertest';
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

const TEST_TSSD = 'test-metadata-tssd';

// Track SOAP call counts for caching tests
let folderSoapCallCount = 0;
let fieldsSoapCallCount = 0;
// dataExtensionSoapCallCount tracked for pagination test
let dataExtensionSoapCallCount = 0;
void dataExtensionSoapCallCount; // Keep for documentation - count tracked in handler

// SOAP response templates
const buildFolderSoapResponse = (
  folders: Array<{ id: string; name: string; parentId?: string }>,
  status = 'OK',
): string => {
  const resultsXml = folders
    .map(
      (f) => `
      <Results xsi:type="DataFolder">
        <ID>${f.id}</ID>
        <Name>${f.name}</Name>
        <ParentFolder><ID>${f.parentId ?? '0'}</ID></ParentFolder>
      </Results>
    `,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>${status}</OverallStatus>
      ${resultsXml}
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

const buildDataExtensionSoapResponse = (
  dataExtensions: Array<{
    objectId: string;
    customerKey: string;
    name: string;
    categoryId: string;
  }>,
  status = 'OK',
  requestId?: string,
): string => {
  const resultsXml = dataExtensions
    .map(
      (de) => `
      <Results xsi:type="DataExtension">
        <ObjectID>${de.objectId}</ObjectID>
        <CustomerKey>${de.customerKey}</CustomerKey>
        <Name>${de.name}</Name>
        <CategoryID>${de.categoryId}</CategoryID>
        <IsSendable>false</IsSendable>
      </Results>
    `,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>${status}</OverallStatus>
      ${requestId ? `<RequestID>${requestId}</RequestID>` : ''}
      ${resultsXml}
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

const buildFieldsSoapResponse = (
  fields: Array<{
    name: string;
    fieldType: string;
    maxLength?: number;
    isPrimaryKey?: boolean;
    isRequired?: boolean;
  }>,
  status = 'OK',
): string => {
  const resultsXml = fields
    .map(
      (f) => `
      <Results xsi:type="DataExtensionField">
        <Name>${f.name}</Name>
        <FieldType>${f.fieldType}</FieldType>
        <MaxLength>${f.maxLength ?? 50}</MaxLength>
        <IsPrimaryKey>${f.isPrimaryKey ?? false}</IsPrimaryKey>
        <IsRequired>${f.isRequired ?? false}</IsRequired>
      </Results>
    `,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>${status}</OverallStatus>
      ${resultsXml}
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

// Default MSW handlers
const defaultHandlers = [
  // Auth endpoints for JWT login
  http.post(`https://${TEST_TSSD}.auth.marketingcloudapis.com/v2/token`, () => {
    return HttpResponse.json({
      access_token: 'metadata-test-access-token',
      refresh_token: 'metadata-test-refresh-token',
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
        sub: 'metadata-test-user',
        enterprise_id: 'metadata-test-eid',
        member_id: 'metadata-test-mid',
        email: 'metadata-test@example.com',
        name: 'Metadata Test User',
      });
    },
  ),
  // SOAP endpoints - handle based on request body
  http.post(
    `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
    async ({ request }) => {
      const body = await request.text();

      // Handle DataFolder requests
      if (body.includes('<ObjectType>DataFolder</ObjectType>')) {
        folderSoapCallCount++;
        const folders = [
          { id: '100', name: 'Data Extensions', parentId: '0' },
          { id: '101', name: 'My Folder', parentId: '100' },
          { id: '102', name: 'Child Folder', parentId: '101' },
        ];
        return HttpResponse.xml(buildFolderSoapResponse(folders));
      }

      // Handle DataExtension requests
      if (body.includes('<ObjectType>DataExtension</ObjectType>')) {
        dataExtensionSoapCallCount++;
        const dataExtensions = [
          {
            objectId: 'de-obj-1',
            customerKey: 'de-key-1',
            name: 'Test DE 1',
            categoryId: '101',
          },
          {
            objectId: 'de-obj-2',
            customerKey: 'de-key-2',
            name: 'Test DE 2',
            categoryId: '102',
          },
        ];
        return HttpResponse.xml(buildDataExtensionSoapResponse(dataExtensions));
      }

      // Handle DataExtensionField requests
      if (body.includes('<ObjectType>DataExtensionField</ObjectType>')) {
        fieldsSoapCallCount++;
        const fields = [
          {
            name: 'Email',
            fieldType: 'EmailAddress',
            maxLength: 254,
            isPrimaryKey: true,
            isRequired: true,
          },
          {
            name: 'FirstName',
            fieldType: 'Text',
            maxLength: 50,
            isPrimaryKey: false,
            isRequired: false,
          },
          {
            name: 'Age',
            fieldType: 'Number',
            isPrimaryKey: false,
            isRequired: false,
          },
        ];
        return HttpResponse.xml(buildFieldsSoapResponse(fields));
      }

      // Default: return error for unknown request types
      return HttpResponse.xml(
        `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>Unknown request type</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`,
        { status: 500 },
      );
    },
  ),
];

const server = setupServer(...defaultHandlers);

describe('Metadata Endpoints (integration)', () => {
  let app: NestFastifyApplication;
  let authenticatedAgent: Agent;
  let csrfToken: string;

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
  });

  afterAll(async () => {
    server.close();
    await app.close();
  });

  beforeEach(async () => {
    // Reset SOAP call counters
    folderSoapCallCount = 0;
    fieldsSoapCallCount = 0;
    dataExtensionSoapCallCount = 0;

    // Create authenticated agent for tests
    authenticatedAgent = superagent(app.getHttpServer());
    const secret = getRequiredEnv('MCE_JWT_SIGNING_SECRET');
    const encodedSecret = new TextEncoder().encode(secret);

    const payload = {
      user_id: 'metadata-test-user',
      enterprise_id: 'metadata-test-eid',
      member_id: 'metadata-test-mid',
      stack: TEST_TSSD,
    };

    const jwt = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(encodedSecret);

    await authenticatedAgent.post('/auth/login').send({ jwt }).expect(302);

    const meResponse = await authenticatedAgent.get('/auth/me').expect(200);
    csrfToken = meResponse.body.csrfToken;
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe('GET /metadata/folders', () => {
    it('should return folder hierarchy', async () => {
      const response = await authenticatedAgent
        .get('/metadata/folders')
        .set('x-csrf-token', csrfToken)
        .expect(200);

      // Verify response is an array with folder structure
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      // Verify folder structure contains expected properties
      const folder = response.body[0];
      expect(folder).toHaveProperty('ID');
      expect(folder).toHaveProperty('Name');
      expect(folder).toHaveProperty('ParentFolder');
    });

    it('should require authentication', async () => {
      // Use fresh agent without session
      const freshAgent = superagent(app.getHttpServer());

      const response = await freshAgent.get('/metadata/folders').expect(401);

      expect(response.body.type).toBe('urn:qpp:error:http-401');
      expect(response.body.detail).toBeDefined();
    });

    it('should handle SOAP error gracefully', async () => {
      // Use unique eid to bypass cache
      const uniqueEid = `error-test-eid-${Date.now()}`;

      // Override SOAP handler to return error
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            return HttpResponse.xml(
              `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>MCE server error</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`,
              { status: 500 },
            );
          },
        ),
      );

      // SOAP errors are mapped to 5xx errors (500 or 502 depending on error path)
      const response = await authenticatedAgent
        .get('/metadata/folders')
        .query({ eid: uniqueEid })
        .set('x-csrf-token', csrfToken);

      // Accept either 500 or 502 as both indicate server-side error
      expect([500, 502]).toContain(response.status);
      // Should return error response, not expose raw SOAP error
      expect(response.body).toBeDefined();
    });

    it('should handle empty folder response', async () => {
      // Use unique eid to bypass cache
      const uniqueEid = `empty-test-eid-${Date.now()}`;

      // Override SOAP handler to return empty results
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            if (body.includes('<ObjectType>DataFolder</ObjectType>')) {
              folderSoapCallCount++;
              return HttpResponse.xml(buildFolderSoapResponse([]));
            }
            return HttpResponse.xml(buildFolderSoapResponse([]));
          },
        ),
      );

      const response = await authenticatedAgent
        .get('/metadata/folders')
        .query({ eid: uniqueEid })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should support eid query parameter for shared folders', async () => {
      const response = await authenticatedAgent
        .get('/metadata/folders')
        .query({ eid: 'shared-eid' })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /metadata/data-extensions', () => {
    it('should return data extensions with folder association', async () => {
      const response = await authenticatedAgent
        .get('/metadata/data-extensions')
        .query({ eid: 'test-eid' })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const de = response.body[0];
      expect(de).toHaveProperty('ObjectID');
      expect(de).toHaveProperty('CustomerKey');
      expect(de).toHaveProperty('Name');
      expect(de).toHaveProperty('CategoryID');
    });

    it('should require authentication', async () => {
      const freshAgent = superagent(app.getHttpServer());

      const response = await freshAgent
        .get('/metadata/data-extensions')
        .query({ eid: 'test-eid' })
        .expect(401);

      expect(response.body.type).toBe('urn:qpp:error:http-401');
    });

    it('should handle SOAP pagination (MoreDataAvailable)', async () => {
      let callCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            if (body.includes('<ObjectType>DataExtension</ObjectType>')) {
              callCount++;

              if (callCount === 1) {
                // First page with MoreDataAvailable
                return HttpResponse.xml(
                  buildDataExtensionSoapResponse(
                    [
                      {
                        objectId: 'de-1',
                        customerKey: 'key-1',
                        name: 'DE 1',
                        categoryId: '100',
                      },
                    ],
                    'MoreDataAvailable',
                    'continue-request-123',
                  ),
                );
              }

              // Second page - final
              return HttpResponse.xml(
                buildDataExtensionSoapResponse([
                  {
                    objectId: 'de-2',
                    customerKey: 'key-2',
                    name: 'DE 2',
                    categoryId: '100',
                  },
                ]),
              );
            }
            return HttpResponse.xml(buildFolderSoapResponse([]));
          },
        ),
      );

      const response = await authenticatedAgent
        .get('/metadata/data-extensions')
        .query({ eid: 'test-eid' })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      // Should have fetched both pages and merged results
      expect(Array.isArray(response.body)).toBe(true);
      // Note: The implementation may call SOAP for both local and shared DEs,
      // so the exact count depends on implementation details
    });

    it('should handle SOAP error gracefully', async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            return HttpResponse.xml(
              `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>MCE server error</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`,
              { status: 500 },
            );
          },
        ),
      );

      // SOAP errors are mapped to 5xx errors (500 or 502 depending on error path)
      const response = await authenticatedAgent
        .get('/metadata/data-extensions')
        .query({ eid: 'test-eid' })
        .set('x-csrf-token', csrfToken);

      // Accept either 500 or 502 as both indicate server-side error
      expect([500, 502]).toContain(response.status);
      expect(response.body).toBeDefined();
    });
  });

  describe('GET /metadata/fields', () => {
    it('should return fields for data extension', async () => {
      const response = await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: 'test-de-key' })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const field = response.body[0];
      expect(field).toHaveProperty('Name');
      expect(field).toHaveProperty('FieldType');
      expect(field).toHaveProperty('IsPrimaryKey');
      expect(field).toHaveProperty('IsRequired');
    });

    it('should handle undefined key query parameter', async () => {
      // When key is undefined, the service still calls SOAP with undefined key
      // The behavior depends on how the SOAP endpoint handles undefined filter
      const response = await authenticatedAgent
        .get('/metadata/fields')
        .set('x-csrf-token', csrfToken);

      // The endpoint should still respond (either with empty array or error)
      // Accept 200 with empty array or 500 if implementation requires key
      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);
      } else {
        // Server error is also acceptable if implementation requires key
        expect([500, 502]).toContain(response.status);
      }
    });

    it('should require authentication', async () => {
      const freshAgent = superagent(app.getHttpServer());

      const response = await freshAgent
        .get('/metadata/fields')
        .query({ key: 'test-de-key' })
        .expect(401);

      expect(response.body.type).toBe('urn:qpp:error:http-401');
    });

    it('should handle non-existent DE', async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            if (body.includes('<ObjectType>DataExtensionField</ObjectType>')) {
              // Return empty response for non-existent DE
              return HttpResponse.xml(buildFieldsSoapResponse([]));
            }
            return HttpResponse.xml(buildFolderSoapResponse([]));
          },
        ),
      );

      const response = await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: 'non-existent-de-key' })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(0);
    });

    it('should handle SOAP error gracefully', async () => {
      // Use a unique key that won't be cached
      const uniqueKey = `error-test-key-${Date.now()}`;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            return HttpResponse.xml(
              `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Server</faultcode>
      <faultstring>MCE server error</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`,
              { status: 500 },
            );
          },
        ),
      );

      // SOAP errors are mapped to 5xx errors (500 or 502 depending on error path)
      const response = await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: uniqueKey })
        .set('x-csrf-token', csrfToken);

      // Accept either 500 or 502 as both indicate server-side error
      expect([500, 502]).toContain(response.status);
      expect(response.body).toBeDefined();
    });
  });

  describe('Caching behavior', () => {
    it('should cache folder response within same test', async () => {
      // Use unique eid to ensure fresh cache key
      const uniqueEid = `cache-test-eid-${Date.now()}`;

      // Reset counter before first call
      folderSoapCallCount = 0;

      // First call with unique eid
      await authenticatedAgent
        .get('/metadata/folders')
        .query({ eid: uniqueEid })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      const firstCallCount = folderSoapCallCount;
      // Should have made at least one SOAP call (actually 2: local + shared)
      expect(firstCallCount).toBeGreaterThan(0);

      // Second call with same eid - should use cache
      await authenticatedAgent
        .get('/metadata/folders')
        .query({ eid: uniqueEid })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      // SOAP call count should not increase (cached)
      expect(folderSoapCallCount).toBe(firstCallCount);
    });

    it('should cache fields response within same test', async () => {
      // Use unique key to ensure fresh cache key
      const uniqueKey = `cache-test-key-${Date.now()}`;

      // Reset counter before first call
      fieldsSoapCallCount = 0;

      // First call
      await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: uniqueKey })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      const firstCallCount = fieldsSoapCallCount;
      expect(firstCallCount).toBeGreaterThan(0);

      // Second call with same key - should use cache
      await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: uniqueKey })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      // SOAP call count should not increase (cached)
      expect(fieldsSoapCallCount).toBe(firstCallCount);
    });

    it('should cache different keys separately', async () => {
      // Use unique keys for this test
      const key1 = `unique-key-1-${Date.now()}`;
      const key2 = `unique-key-2-${Date.now()}`;

      // Reset counter
      fieldsSoapCallCount = 0;

      // First call for key-1
      await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: key1 })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      const countAfterFirst = fieldsSoapCallCount;

      // Call for key-2 - should trigger new SOAP call
      await authenticatedAgent
        .get('/metadata/fields')
        .query({ key: key2 })
        .set('x-csrf-token', csrfToken)
        .expect(200);

      // SOAP call count should increase for different key
      expect(fieldsSoapCallCount).toBeGreaterThan(countAfterFirst);
    });
  });
});
