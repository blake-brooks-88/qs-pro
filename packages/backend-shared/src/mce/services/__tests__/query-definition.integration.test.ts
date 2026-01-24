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
import { QueryDefinitionService } from "../query-definition.service";

const TEST_TSSD = "test-qd-tssd";
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
  queryDefinitions: Array<{
    objectId: string;
    customerKey: string;
    name: string;
    categoryId?: number;
  }>,
  status = "OK",
  requestId?: string,
): string => {
  const resultsXml = queryDefinitions
    .map(
      (qd) => `
      <Results xsi:type="QueryDefinition">
        <ObjectID>${qd.objectId}</ObjectID>
        <CustomerKey>${qd.customerKey}</CustomerKey>
        <Name>${qd.name}</Name>
        ${qd.categoryId !== undefined ? `<CategoryID>${qd.categoryId}</CategoryID>` : ""}
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

const buildPerformResponse = (taskId: string, statusCode = "OK"): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <PerformResponseMsg>
      <Results>
        <Result>
          <StatusCode>${statusCode}</StatusCode>
          <TaskID>${taskId}</TaskID>
          <Task>
            <StatusCode>${statusCode}</StatusCode>
            <ID>${taskId}</ID>
          </Task>
        </Result>
      </Results>
    </PerformResponseMsg>
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

describe("QueryDefinitionService (integration)", () => {
  let module: TestingModule;
  let service: QueryDefinitionService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "bypass" });

    module = await Test.createTestingModule({
      providers: [
        QueryDefinitionService,
        MceBridgeService,
        MceHttpClient,
        { provide: MCE_AUTH_PROVIDER, useValue: stubAuthProvider },
      ],
    }).compile();

    service = module.get(QueryDefinitionService);
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

  describe("retrieve", () => {
    it("sends correct SOAP RetrieveRequest with CustomerKey filter", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(
              buildRetrieveResponse([
                {
                  objectId: "qd-obj-1",
                  customerKey: "qd-key-1",
                  name: "My Query",
                },
              ]),
            );
          },
        ),
      );

      await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "qd-key-1",
      );

      // Verify SOAP envelope structure
      expect(capturedBody).toContain("soap:Envelope");
      expect(capturedBody).toContain("<fueloauth");
      expect(capturedBody).toContain("test-access-token");

      // Verify RetrieveRequest for QueryDefinition
      expect(capturedBody).toContain(
        "<ObjectType>QueryDefinition</ObjectType>",
      );
      expect(capturedBody).toContain("<Properties>ObjectID</Properties>");
      expect(capturedBody).toContain("<Properties>CustomerKey</Properties>");

      // Verify CustomerKey filter
      expect(capturedBody).toContain("<Property>CustomerKey</Property>");
      expect(capturedBody).toContain("<SimpleOperator>equals</SimpleOperator>");
      expect(capturedBody).toContain("<Value>qd-key-1</Value>");
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
                  customerKey: "key-abc",
                  name: "Test Query",
                  categoryId: 500,
                },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "key-abc",
      );

      expect(result).toEqual({
        objectId: "obj-abc",
        customerKey: "key-abc",
        name: "Test Query",
        categoryId: 500,
      });
    });

    it("returns null when not found", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "nonexistent",
      );

      expect(result).toBeNull();
    });

    it("returns null on Error status with no results", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildRetrieveResponse([], "Error"));
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "missing",
      );

      expect(result).toBeNull();
    });
  });

  describe("retrieveByFolder", () => {
    it("sends correct SOAP filter for CategoryID", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      await service.retrieveByFolder(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        12345,
      );

      expect(capturedBody).toContain(
        "<ObjectType>QueryDefinition</ObjectType>",
      );
      expect(capturedBody).toContain("<Property>CategoryID</Property>");
      expect(capturedBody).toContain("<SimpleOperator>equals</SimpleOperator>");
      expect(capturedBody).toContain("<Value>12345</Value>");
    });

    it("includes olderThan filter when provided", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      const olderThan = new Date("2026-01-20T00:00:00Z");
      await service.retrieveByFolder(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        100,
        olderThan,
      );

      expect(capturedBody).toContain("ComplexFilterPart");
      expect(capturedBody).toContain("<Property>CategoryID</Property>");
      expect(capturedBody).toContain("<LogicalOperator>AND</LogicalOperator>");
      expect(capturedBody).toContain("<Property>CreatedDate</Property>");
      expect(capturedBody).toContain(
        "<SimpleOperator>lessThan</SimpleOperator>",
      );
      expect(capturedBody).toContain("2026-01-20");
    });

    it("parses multiple query definitions", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildRetrieveResponse([
                {
                  objectId: "obj-1",
                  customerKey: "key-1",
                  name: "Query 1",
                  categoryId: 100,
                },
                {
                  objectId: "obj-2",
                  customerKey: "key-2",
                  name: "Query 2",
                  categoryId: 100,
                },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieveByFolder(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        100,
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        objectId: "obj-1",
        customerKey: "key-1",
        name: "Query 1",
        categoryId: 100,
      });
      expect(result[1]).toEqual({
        objectId: "obj-2",
        customerKey: "key-2",
        name: "Query 2",
        categoryId: 100,
      });
    });

    it("handles pagination with MoreDataAvailable", async () => {
      let callCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            callCount++;
            const body = await request.text();

            if (callCount === 1) {
              return HttpResponse.xml(
                buildRetrieveResponse(
                  [
                    {
                      objectId: "qd-1",
                      customerKey: "k-1",
                      name: "Q1",
                      categoryId: 100,
                    },
                  ],
                  "MoreDataAvailable",
                  "continue-req-xyz",
                ),
              );
            }

            // Verify continuation request
            expect(body).toContain("ContinueRequest");
            expect(body).toContain("continue-req-xyz");

            return HttpResponse.xml(
              buildRetrieveResponse([
                {
                  objectId: "qd-2",
                  customerKey: "k-2",
                  name: "Q2",
                  categoryId: 100,
                },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieveByFolder(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        100,
      );

      expect(callCount).toBe(2);
      expect(result).toHaveLength(2);
    });
  });

  describe("create", () => {
    it("sends correct CreateRequest XML structure", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildCreateResponse("new-qd-obj-id"));
          },
        ),
      );

      await service.create(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        name: "QPP_Query_abc123",
        customerKey: "QPP_Query_abc123",
        categoryId: 500,
        targetId: "de-target-obj-id",
        targetCustomerKey: "QPP_Result_abc123",
        targetName: "QPP Result abc123",
        queryText: "SELECT Email, FirstName FROM Subscribers",
      });

      // Verify CreateRequest structure
      expect(capturedBody).toContain(
        '<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"',
      );
      expect(capturedBody).toContain('xsi:type="QueryDefinition"');
      expect(capturedBody).toContain("<Name>QPP_Query_abc123</Name>");
      expect(capturedBody).toContain(
        "<CustomerKey>QPP_Query_abc123</CustomerKey>",
      );
      expect(capturedBody).toContain("<CategoryID>500</CategoryID>");

      // Verify target DE
      expect(capturedBody).toContain("<DataExtensionTarget>");
      expect(capturedBody).toContain("<ObjectID>de-target-obj-id</ObjectID>");
      expect(capturedBody).toContain(
        "<CustomerKey>QPP_Result_abc123</CustomerKey>",
      );
      expect(capturedBody).toContain("<Name>QPP Result abc123</Name>");

      // Verify query text (should be escaped)
      expect(capturedBody).toContain("<QueryText>");
      expect(capturedBody).toContain(
        "SELECT Email, FirstName FROM Subscribers",
      );

      // Verify other settings
      expect(capturedBody).toContain("<TargetType>DE</TargetType>");
      expect(capturedBody).toContain(
        "<TargetUpdateType>Overwrite</TargetUpdateType>",
      );
    });

    it("returns created objectId", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildCreateResponse("created-qd-xyz"));
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
          targetId: "de-id",
          targetCustomerKey: "de-key",
          targetName: "DE Name",
          queryText: "SELECT 1",
        },
      );

      expect(result).toEqual({ objectId: "created-qd-xyz" });
    });

    it("escapes special XML characters in queryText", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildCreateResponse("qd-obj"));
          },
        ),
      );

      await service.create(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        name: "Test",
        customerKey: "test-key",
        categoryId: 1,
        targetId: "de-id",
        targetCustomerKey: "de-key",
        targetName: "DE Name",
        queryText: "SELECT * FROM [My DE] WHERE Field = 'Value' AND Age < 30",
      });

      // Verify XML escaping of < and >
      expect(capturedBody).toContain("&lt;");
      expect(capturedBody).toContain("&apos;");
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
          targetId: "de-id",
          targetCustomerKey: "de-key",
          targetName: "DE Name",
          queryText: "SELECT 1",
        }),
      ).rejects.toThrow();
    });
  });

  describe("perform", () => {
    it("sends correct PerformRequest XML with ObjectID", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildPerformResponse("task-id-123"));
          },
        ),
      );

      await service.perform(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "qd-object-id-to-run",
      );

      // Verify PerformRequest structure
      expect(capturedBody).toContain(
        '<PerformRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI"',
      );
      expect(capturedBody).toContain("<Action>Start</Action>");
      expect(capturedBody).toContain("<Definitions>");
      expect(capturedBody).toContain('xsi:type="QueryDefinition"');
      expect(capturedBody).toContain(
        "<ObjectID>qd-object-id-to-run</ObjectID>",
      );
    });

    it("returns taskId from response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildPerformResponse("async-task-999"));
          },
        ),
      );

      const result = await service.perform(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "qd-obj",
      );

      expect(result).toEqual({ taskId: "async-task-999" });
    });

    it("throws on SOAP error response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildPerformResponse("", "Error"));
          },
        ),
      );

      await expect(
        service.perform(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "qd-obj"),
      ).rejects.toThrow();
    });

    it("throws when no TaskID returned", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <PerformResponseMsg>
      <Results>
        <Result>
          <StatusCode>OK</StatusCode>
        </Result>
      </Results>
    </PerformResponseMsg>
  </soap:Body>
</soap:Envelope>`);
          },
        ),
      );

      await expect(
        service.perform(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "qd-obj"),
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("sends correct DeleteRequest XML with ObjectID", async () => {
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
        "qd-obj-to-delete",
      );

      // Verify DeleteRequest structure
      expect(capturedBody).toContain(
        '<DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"',
      );
      expect(capturedBody).toContain('xsi:type="QueryDefinition"');
      expect(capturedBody).toContain("<ObjectID>qd-obj-to-delete</ObjectID>");
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
        service.delete(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "qd-obj"),
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
        service.delete(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "qd-obj"),
      ).rejects.toThrow();
    });
  });
});
