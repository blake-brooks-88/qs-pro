import { Test, TestingModule } from "@nestjs/testing";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { MCE_AUTH_PROVIDER, MceAuthProvider } from "../../mce-auth.provider";
import { MceBridgeService } from "../../mce-bridge.service";
import { MceHttpClient } from "../../mce-http-client";
import { DataExtensionService } from "../data-extension.service";

const TEST_TSSD = "test-de-tssd";
const TEST_TENANT_ID = "test-tenant-id";
const TEST_USER_ID = "test-user-id";
const TEST_MID = "test-mid";

// Stub MceAuthProvider that returns pre-authenticated credentials
const stubAuthProvider: MceAuthProvider = {
  refreshToken: async () => ({
    accessToken: "test-access-token",
    tssd: TEST_TSSD,
  }),
  invalidateToken: async () => {},
};

// Track captured SOAP request bodies
let capturedBody = "";

// SOAP response builders
const buildRetrieveResponse = (
  results: Array<{ objectId: string; customerKey: string; name: string }>,
  status = "OK",
  requestId?: string,
): string => {
  const resultsXml = results
    .map(
      (r) => `
      <Results xsi:type="DataExtension">
        <ObjectID>${r.objectId}</ObjectID>
        <CustomerKey>${r.customerKey}</CustomerKey>
        <Name>${r.name}</Name>
      </Results>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>${status}</OverallStatus>
      ${requestId ? `<RequestID>${requestId}</RequestID>` : ""}
      ${resultsXml}
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

const buildFieldsResponse = (
  fields: Array<{
    name: string;
    fieldType: string;
    maxLength?: number;
    isPrimaryKey?: boolean;
    isRequired?: boolean;
  }>,
  status = "OK",
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
      </Results>`,
    )
    .join("");

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

const buildCreateResponse = (objectId: string, statusCode = "OK"): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateResponse>
      <Results>
        <StatusCode>${statusCode}</StatusCode>
        <NewObjectID>${objectId}</NewObjectID>
      </Results>
    </CreateResponse>
  </soap:Body>
</soap:Envelope>`;
};

const buildDeleteResponse = (statusCode = "OK"): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <DeleteResponse>
      <Results>
        <StatusCode>${statusCode}</StatusCode>
      </Results>
    </DeleteResponse>
  </soap:Body>
</soap:Envelope>`;
};

// Default MSW handler
const defaultHandler = http.post(
  `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
  async ({ request }) => {
    capturedBody = await request.text();
    return HttpResponse.xml(buildRetrieveResponse([]));
  },
);

const server = setupServer(defaultHandler);

describe("DataExtensionService (integration)", () => {
  let module: TestingModule;
  let service: DataExtensionService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "bypass" });

    module = await Test.createTestingModule({
      providers: [
        DataExtensionService,
        MceBridgeService,
        MceHttpClient,
        { provide: MCE_AUTH_PROVIDER, useValue: stubAuthProvider },
      ],
    }).compile();

    service = module.get(DataExtensionService);
  });

  afterAll(async () => {
    server.close();
    await module.close();
  });

  beforeEach(() => {
    capturedBody = "";
  });

  afterEach(() => {
    server.resetHandlers();
  });

  describe("retrieveAll", () => {
    it("sends correct SOAP RetrieveRequest structure", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(
              buildRetrieveResponse([
                { objectId: "de-1", customerKey: "key-1", name: "Test DE" },
              ]),
            );
          },
        ),
      );

      await service.retrieveAll(TEST_TENANT_ID, TEST_USER_ID, TEST_MID);

      // Verify SOAP envelope structure
      expect(capturedBody).toContain("soap:Envelope");
      expect(capturedBody).toContain(
        'xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"',
      );

      // Verify fueloauth token header
      expect(capturedBody).toContain("<fueloauth");
      expect(capturedBody).toContain("test-access-token");

      // Verify RetrieveRequest body
      expect(capturedBody).toContain("<ObjectType>DataExtension</ObjectType>");
      expect(capturedBody).toContain("<Properties>ObjectID</Properties>");
      expect(capturedBody).toContain("<Properties>CustomerKey</Properties>");
      expect(capturedBody).toContain("<Properties>Name</Properties>");
    });

    it("parses successful response with multiple results", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildRetrieveResponse([
                { objectId: "de-1", customerKey: "key-1", name: "First DE" },
                { objectId: "de-2", customerKey: "key-2", name: "Second DE" },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieveAll(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        objectId: "de-1",
        customerKey: "key-1",
        name: "First DE",
      });
      expect(result[1]).toEqual({
        objectId: "de-2",
        customerKey: "key-2",
        name: "Second DE",
      });
    });

    it("includes clientId filter when provided", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      await service.retrieveAll(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "client-123",
      );

      expect(capturedBody).toContain("<ClientIDs>");
      expect(capturedBody).toContain("<ClientID>client-123</ClientID>");
    });
  });

  describe("retrieveByName", () => {
    it("sends correct filter for name lookup", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(
              buildRetrieveResponse([
                { objectId: "de-1", customerKey: "key-1", name: "My DE" },
              ]),
            );
          },
        ),
      );

      await service.retrieveByName(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "My DE",
      );

      expect(capturedBody).toContain("<ObjectType>DataExtension</ObjectType>");
      expect(capturedBody).toContain("<Property>Name</Property>");
      expect(capturedBody).toContain("<SimpleOperator>equals</SimpleOperator>");
      expect(capturedBody).toContain("<Value>My DE</Value>");
    });

    it("returns null when no results found", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      const result = await service.retrieveByName(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "Nonexistent",
      );

      expect(result).toBeNull();
    });

    it("parses successful single result", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildRetrieveResponse([
                {
                  objectId: "obj-abc",
                  customerKey: "ck-abc",
                  name: "Found DE",
                },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieveByName(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "Found DE",
      );

      expect(result).toEqual({
        objectId: "obj-abc",
        customerKey: "ck-abc",
        name: "Found DE",
      });
    });
  });

  describe("retrieveFields", () => {
    it("retrieves DE by name first, then fields by CustomerKey", async () => {
      let callCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            callCount++;
            capturedBody = await request.text();

            if (
              capturedBody.includes("<ObjectType>DataExtension</ObjectType>")
            ) {
              // First call: lookup DE by name
              return HttpResponse.xml(
                buildRetrieveResponse([
                  {
                    objectId: "de-obj",
                    customerKey: "de-customer-key",
                    name: "TestDE",
                  },
                ]),
              );
            }

            // Second call: retrieve fields by CustomerKey
            return HttpResponse.xml(
              buildFieldsResponse([
                {
                  name: "Email",
                  fieldType: "EmailAddress",
                  isPrimaryKey: true,
                  isRequired: true,
                },
                { name: "FirstName", fieldType: "Text", maxLength: 100 },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieveFields(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "TestDE",
      );

      expect(callCount).toBe(2);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "Email",
        fieldType: "EmailAddress",
        maxLength: 50, // maxLength is parsed when present in response
        isPrimaryKey: true,
        isRequired: true,
      });
    });

    it("sends correct filter for DataExtensionField retrieval", async () => {
      let fieldsRequestBody = "";

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();

            if (body.includes("<ObjectType>DataExtension</ObjectType>")) {
              return HttpResponse.xml(
                buildRetrieveResponse([
                  { objectId: "de-obj", customerKey: "my-ck", name: "TestDE" },
                ]),
              );
            }

            fieldsRequestBody = body;
            return HttpResponse.xml(
              buildFieldsResponse([{ name: "Id", fieldType: "Number" }]),
            );
          },
        ),
      );

      await service.retrieveFields(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "TestDE",
      );

      expect(fieldsRequestBody).toContain(
        "<ObjectType>DataExtensionField</ObjectType>",
      );
      expect(fieldsRequestBody).toContain(
        "<Property>DataExtension.CustomerKey</Property>",
      );
      expect(fieldsRequestBody).toContain("<Value>my-ck</Value>");
    });

    it("returns empty array when DE not found", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      const result = await service.retrieveFields(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "Nonexistent",
      );

      expect(result).toEqual([]);
    });
  });

  describe("create", () => {
    it("sends correct CreateRequest XML structure", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildCreateResponse("new-de-object-id"));
          },
        ),
      );

      await service.create(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        name: "New DE",
        customerKey: "new-de-key",
        categoryId: 12345,
        fields: [
          {
            name: "Email",
            fieldType: "EmailAddress",
            maxLength: 254,
            isPrimaryKey: true,
          },
          { name: "Age", fieldType: "Number" },
        ],
      });

      // Verify CreateRequest structure
      expect(capturedBody).toContain(
        '<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"',
      );
      expect(capturedBody).toContain('xsi:type="DataExtension"');
      expect(capturedBody).toContain("<Name>New DE</Name>");
      expect(capturedBody).toContain("<CustomerKey>new-de-key</CustomerKey>");
      expect(capturedBody).toContain("<CategoryID>12345</CategoryID>");

      // Verify fields
      expect(capturedBody).toContain("<Fields>");
      expect(capturedBody).toContain("<Name>Email</Name>");
      expect(capturedBody).toContain("<FieldType>EmailAddress</FieldType>");
      expect(capturedBody).toContain("<IsPrimaryKey>true</IsPrimaryKey>");
      expect(capturedBody).toContain("<Name>Age</Name>");
      expect(capturedBody).toContain("<FieldType>Number</FieldType>");
    });

    it("returns created objectId", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildCreateResponse("created-obj-123"));
          },
        ),
      );

      const result = await service.create(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        {
          name: "Test",
          customerKey: "test-key",
          categoryId: 1,
          fields: [{ name: "Id", fieldType: "Number" }],
        },
      );

      expect(result).toEqual({ objectId: "created-obj-123" });
    });

    it("throws on SOAP error response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildCreateResponse("", "Error"));
          },
        ),
      );

      await expect(
        service.create(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
          name: "Test",
          customerKey: "test-key",
          categoryId: 1,
          fields: [{ name: "Id", fieldType: "Number" }],
        }),
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("sends correct DeleteRequest XML with CustomerKey", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildDeleteResponse());
          },
        ),
      );

      await service.delete(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "de-to-delete",
      );

      expect(capturedBody).toContain(
        '<DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"',
      );
      expect(capturedBody).toContain('xsi:type="DataExtension"');
      expect(capturedBody).toContain("<CustomerKey>de-to-delete</CustomerKey>");
    });

    it("completes successfully on OK status", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildDeleteResponse("OK"));
          },
        ),
      );

      await expect(
        service.delete(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "de-to-delete"),
      ).resolves.toBeUndefined();
    });

    it("throws on SOAP error response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildDeleteResponse("Error"));
          },
        ),
      );

      await expect(
        service.delete(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "de-to-delete"),
      ).rejects.toThrow();
    });
  });
});
