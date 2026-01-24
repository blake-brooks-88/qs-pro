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
import { AsyncStatusService } from "../async-status.service";

const TEST_TSSD = "test-async-tssd";
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

// SOAP response builders for AsyncActivityStatus
const buildAsyncStatusSoapResponse = (
  status: string,
  errorMsg?: string,
  completedDate?: string,
): string => {
  const properties = [
    `<Property><Name>Status</Name><Value>${status}</Value></Property>`,
    errorMsg
      ? `<Property><Name>ErrorMsg</Name><Value>${errorMsg}</Value></Property>`
      : "",
    completedDate
      ? `<Property><Name>CompletedDate</Name><Value>${completedDate}</Value></Property>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>OK</OverallStatus>
      <Results>
        <Properties>
          ${properties}
        </Properties>
      </Results>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

const buildEmptyAsyncStatusSoapResponse = (): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>OK</OverallStatus>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

const buildStatusOnlyResponse = (status: string, errorMsg?: string): string => {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>OK</OverallStatus>
      <Results>
        <Status>${status}</Status>
        ${errorMsg ? `<ErrorMsg>${errorMsg}</ErrorMsg>` : ""}
      </Results>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;
};

// Default MSW handler
const defaultHandler = http.post(
  `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
  async () => {
    return HttpResponse.xml(buildAsyncStatusSoapResponse("Complete"));
  },
);

const server = setupServer(defaultHandler);

describe("AsyncStatusService (integration)", () => {
  let module: TestingModule;
  let service: AsyncStatusService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "bypass" });

    module = await Test.createTestingModule({
      providers: [
        AsyncStatusService,
        MceBridgeService,
        MceHttpClient,
        { provide: MCE_AUTH_PROVIDER, useValue: stubAuthProvider },
      ],
    }).compile();

    service = module.get(AsyncStatusService);
  });

  beforeEach(() => {
    // Reset handlers between tests
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(async () => {
    server.close();
    await module.close();
  });

  describe("retrieve", () => {
    it("sends correct SOAP request with TaskID filter", async () => {
      let capturedBody = "";

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.xml(buildAsyncStatusSoapResponse("Complete"));
          },
        ),
      );

      await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-id-123",
      );

      // Verify SOAP envelope structure
      expect(capturedBody).toContain("soap:Envelope");
      expect(capturedBody).toContain("<fueloauth");
      expect(capturedBody).toContain("test-access-token");

      // Verify RetrieveRequest for AsyncActivityStatus
      expect(capturedBody).toContain(
        "<ObjectType>AsyncActivityStatus</ObjectType>",
      );
      expect(capturedBody).toContain("<Properties>Status</Properties>");
      expect(capturedBody).toContain("<Properties>ErrorMsg</Properties>");
      expect(capturedBody).toContain("<Properties>CompletedDate</Properties>");

      // Verify TaskID filter
      expect(capturedBody).toContain("<Property>TaskID</Property>");
      expect(capturedBody).toContain("<SimpleOperator>equals</SimpleOperator>");
      expect(capturedBody).toContain("<Value>task-id-123</Value>");
    });

    it("parses Complete status response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildAsyncStatusSoapResponse(
                "Complete",
                undefined,
                "2026-01-24T12:00:00Z",
              ),
            );
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-123",
      );

      expect(result).toEqual({
        status: "Complete",
        errorMsg: undefined,
        completedDate: "2026-01-24T12:00:00Z",
      });
    });

    it("parses Pending status response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildAsyncStatusSoapResponse("Pending"));
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-pending",
      );

      expect(result.status).toBe("Pending");
      expect(result.completedDate).toBeUndefined();
    });

    it("parses Processing status response", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildAsyncStatusSoapResponse("Processing"));
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-processing",
      );

      expect(result.status).toBe("Processing");
    });

    it("parses Error status with error message", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildAsyncStatusSoapResponse(
                "Error",
                "Query execution failed: syntax error",
                "2026-01-24T12:30:00Z",
              ),
            );
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-error",
      );

      expect(result).toEqual({
        status: "Error",
        errorMsg: "Query execution failed: syntax error",
        completedDate: "2026-01-24T12:30:00Z",
      });
    });

    it("handles empty response (no Properties)", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(buildEmptyAsyncStatusSoapResponse());
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-empty",
      );

      expect(result).toEqual({});
    });

    it("handles status-only response (no Properties element)", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            return HttpResponse.xml(
              buildStatusOnlyResponse("Complete", "Some message"),
            );
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-status-only",
      );

      expect(result.status).toBe("Complete");
      expect(result.errorMsg).toBe("Some message");
    });

    it("handles single Property element (not array)", async () => {
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async () => {
            // Return single Property (not wrapped in array)
            return HttpResponse.xml(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RetrieveResponseMsg>
      <OverallStatus>OK</OverallStatus>
      <Results>
        <Properties>
          <Property><Name>Status</Name><Value>Complete</Value></Property>
        </Properties>
      </Results>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`);
          },
        ),
      );

      const result = await service.retrieve(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "task-single-prop",
      );

      expect(result.status).toBe("Complete");
    });
  });
});
