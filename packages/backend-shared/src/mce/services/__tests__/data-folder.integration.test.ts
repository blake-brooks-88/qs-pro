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
import { DataFolderService } from "../data-folder.service";

const TEST_TSSD = "test-folder-tssd";
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
  folders: Array<{ id: number; name: string; parentFolderId?: number }>,
  status = "OK",
  requestId?: string,
): string => {
  const resultsXml = folders
    .map(
      (f) => `
      <Results xsi:type="DataFolder">
        <ID>${f.id}</ID>
        <Name>${f.name}</Name>
        ${f.parentFolderId !== undefined ? `<ParentFolder><ID>${f.parentFolderId}</ID></ParentFolder>` : ""}
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

const buildCreateResponse = (newId: string, statusCode = "OK"): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateResponse>
      <Results>
        <StatusCode>${statusCode}</StatusCode>
        <NewID>${newId}</NewID>
      </Results>
    </CreateResponse>
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

describe("DataFolderService (integration)", () => {
  let module: TestingModule;
  let service: DataFolderService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "bypass" });

    module = await Test.createTestingModule({
      providers: [
        DataFolderService,
        MceBridgeService,
        MceHttpClient,
        { provide: MCE_AUTH_PROVIDER, useValue: stubAuthProvider },
      ],
    }).compile();

    service = module.get(DataFolderService);
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
    it("sends correct SOAP RetrieveRequest for DataFolder ObjectType", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(
              buildRetrieveResponse([{ id: 100, name: "Data Extensions" }]),
            );
          },
        ),
      );

      await service.retrieve(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {});

      // Verify SOAP envelope structure
      expect(capturedBody).toContain("soap:Envelope");
      expect(capturedBody).toContain("<fueloauth");
      expect(capturedBody).toContain("test-access-token");

      // Verify RetrieveRequest for DataFolder
      expect(capturedBody).toContain("<ObjectType>DataFolder</ObjectType>");
      expect(capturedBody).toContain("<Properties>ID</Properties>");
      expect(capturedBody).toContain("<Properties>Name</Properties>");
      expect(capturedBody).toContain(
        "<Properties>ParentFolder.ID</Properties>",
      );
    });

    it("includes name filter when provided", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      await service.retrieve(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        name: "My Folder",
      });

      expect(capturedBody).toContain("<Property>Name</Property>");
      expect(capturedBody).toContain("<SimpleOperator>equals</SimpleOperator>");
      expect(capturedBody).toContain("<Value>My Folder</Value>");
    });

    it("includes contentType filter when provided", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      await service.retrieve(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        contentType: "dataextension",
      });

      expect(capturedBody).toContain("<Property>ContentType</Property>");
      expect(capturedBody).toContain("<Value>dataextension</Value>");
    });

    it("includes complex filter for name AND contentType", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      await service.retrieve(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        name: "Query Results",
        contentType: "dataextension",
      });

      expect(capturedBody).toContain("ComplexFilterPart");
      expect(capturedBody).toContain("<LogicalOperator>AND</LogicalOperator>");
      expect(capturedBody).toContain("<Property>Name</Property>");
      expect(capturedBody).toContain("<Value>Query Results</Value>");
      expect(capturedBody).toContain("<Property>ContentType</Property>");
      expect(capturedBody).toContain("<Value>dataextension</Value>");
    });

    it("includes clientId when provided", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildRetrieveResponse([]));
          },
        ),
      );

      await service.retrieve(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        clientId: "shared-bu-123",
      });

      expect(capturedBody).toContain("<ClientIDs>");
      expect(capturedBody).toContain("<ClientID>shared-bu-123</ClientID>");
    });

    it("parses successful response with folder hierarchy", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildRetrieveResponse([
                { id: 100, name: "Data Extensions" },
                { id: 101, name: "My Folder", parentFolderId: 100 },
                { id: 102, name: "Child Folder", parentFolderId: 101 },
              ]),
            );
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        {},
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: 100, name: "Data Extensions" });
      expect(result[1]).toEqual({
        id: 101,
        name: "My Folder",
        parentFolderId: 100,
      });
      expect(result[2]).toEqual({
        id: 102,
        name: "Child Folder",
        parentFolderId: 101,
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
              // First page with MoreDataAvailable
              return HttpResponse.xml(
                buildRetrieveResponse(
                  [{ id: 1, name: "Folder 1" }],
                  "MoreDataAvailable",
                  "continue-request-abc",
                ),
              );
            }

            // Verify continuation request
            expect(body).toContain("ContinueRequest");
            expect(body).toContain("continue-request-abc");

            // Second page - final
            return HttpResponse.xml(
              buildRetrieveResponse([{ id: 2, name: "Folder 2" }]),
            );
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        {},
      );

      expect(callCount).toBe(2);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Folder 1");
      expect(result[1].name).toBe("Folder 2");
    });

    it("throws on SOAP error response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildRetrieveResponse([], "Error"));
          },
        ),
      );

      await expect(
        service.retrieve(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {}),
      ).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("sends correct CreateRequest XML structure", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildCreateResponse("999"));
          },
        ),
      );

      await service.create(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        name: "QPP Results",
        parentFolderId: 100,
        contentType: "dataextension",
      });

      // Verify CreateRequest structure
      expect(capturedBody).toContain(
        '<CreateRequest xmlns="http://exacttarget.com/wsdl/partnerAPI"',
      );
      expect(capturedBody).toContain('xsi:type="DataFolder"');
      expect(capturedBody).toContain("<Name>QPP Results</Name>");
      expect(capturedBody).toContain(
        "<ContentType>dataextension</ContentType>",
      );
      expect(capturedBody).toContain("<ParentFolder>");
      expect(capturedBody).toContain("<ID>100</ID>");
    });

    it("returns created folder id", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildCreateResponse("12345"));
          },
        ),
      );

      const result = await service.create(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        {
          name: "New Folder",
          parentFolderId: 1,
          contentType: "dataextension",
        },
      );

      expect(result).toEqual({ id: 12345 });
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
          parentFolderId: 1,
          contentType: "dataextension",
        }),
      ).rejects.toThrow();
    });

    it("throws when no ID returned", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            // Return OK status but no NewID
            return HttpResponse.xml(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateResponse>
      <Results>
        <StatusCode>OK</StatusCode>
      </Results>
    </CreateResponse>
  </soap:Body>
</soap:Envelope>`);
          },
        ),
      );

      await expect(
        service.create(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
          name: "Test",
          parentFolderId: 1,
          contentType: "dataextension",
        }),
      ).rejects.toThrow();
    });
  });
});
