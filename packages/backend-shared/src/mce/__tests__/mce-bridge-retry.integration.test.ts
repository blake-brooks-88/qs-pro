/**
 * MceBridgeService Retry Logic Integration Tests
 *
 * Tests the retry-after-token-invalidation logic for both REST and SOAP requests.
 * Uses MSW stateful handlers to simulate 401/Login Failed on first call, then succeed on retry.
 *
 * Test Strategy:
 * - Real NestJS module with actual MceBridgeService
 * - Stub MceAuthProvider that tracks invalidation and refresh calls
 * - MSW for MCE API mocking (external boundary only)
 * - Behavioral assertions via call counts and return values
 *
 * Covered Behaviors:
 * - REST request retry after 401 Unauthorized
 * - SOAP request retry after "Login Failed" fault
 * - 400 errors do NOT trigger retry
 * - 500 errors do NOT trigger retry
 * - Token invalidation is called before retry
 */
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

import { AppError, ErrorCode } from "../../common/errors";
import { MCE_AUTH_PROVIDER, MceAuthProvider } from "../mce-auth.provider";
import { MceBridgeService } from "../mce-bridge.service";
import { MceHttpClient } from "../mce-http-client";

// Test constants
const TEST_TSSD = "retry-test-tssd";
const TEST_TENANT_ID = "test-tenant-id";
const TEST_USER_ID = "test-user-id";
const TEST_MID = "test-mid";

// MSW server setup
const server = setupServer();

// Stub auth provider that tracks calls and returns different tokens on refresh
interface AuthProviderState {
  invalidateCalls: Array<{
    tenantId: string;
    userId: string;
    mid: string;
  }>;
  refreshCalls: Array<{
    tenantId: string;
    userId: string;
    mid: string;
    forceRefresh: boolean;
  }>;
  currentToken: string;
  refreshedToken: string;
}

function createStubAuthProvider(state: AuthProviderState): MceAuthProvider {
  return {
    refreshToken: async (
      tenantId: string,
      userId: string,
      mid: string,
      forceRefresh = false,
    ) => {
      state.refreshCalls.push({ tenantId, userId, mid, forceRefresh });
      // Return different token after forceRefresh
      const token = forceRefresh ? state.refreshedToken : state.currentToken;
      return { accessToken: token, tssd: TEST_TSSD };
    },
    invalidateToken: async (tenantId: string, userId: string, mid: string) => {
      state.invalidateCalls.push({ tenantId, userId, mid });
    },
  };
}

describe("MceBridgeService retry logic (integration)", () => {
  let module: TestingModule;
  let mceBridgeService: MceBridgeService;
  let authState: AuthProviderState;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "bypass" });
  });

  beforeEach(async () => {
    server.resetHandlers();

    // Reset auth state for each test
    authState = {
      invalidateCalls: [],
      refreshCalls: [],
      currentToken: "initial-access-token",
      refreshedToken: "refreshed-access-token",
    };

    // Create fresh test module for each test
    module = await Test.createTestingModule({
      providers: [
        MceBridgeService,
        MceHttpClient,
        {
          provide: MCE_AUTH_PROVIDER,
          useValue: createStubAuthProvider(authState),
        },
      ],
    }).compile();

    mceBridgeService = module.get<MceBridgeService>(MceBridgeService);
  });

  afterEach(async () => {
    await module.close();
  });

  afterAll(async () => {
    server.close();
    await module.close();
  });

  describe("REST 401 retry", () => {
    it("should retry REST request after 401 with token refresh", async () => {
      let restCallCount = 0;

      // MSW handler: First REST call returns 401, second succeeds
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/async/status`,
          () => {
            restCallCount++;
            if (restCallCount === 1) {
              return HttpResponse.json(
                { message: "Unauthorized" },
                { status: 401 },
              );
            }
            return HttpResponse.json({
              status: "Complete",
              requestId: "test-request-id",
            });
          },
        ),
      );

      // Execute the request
      const result = await mceBridgeService.request<{
        status: string;
        requestId: string;
      }>(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        method: "GET",
        url: "/data/v1/async/status",
      });

      // Verify retry happened - 2 REST calls
      expect(restCallCount).toBe(2);

      // Verify successful result
      expect(result.status).toBe("Complete");
      expect(result.requestId).toBe("test-request-id");

      // Verify token invalidation was called
      expect(authState.invalidateCalls).toHaveLength(1);
      expect(authState.invalidateCalls[0]).toEqual({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
      });

      // Verify refresh was called twice: once initially, once with forceRefresh
      expect(authState.refreshCalls).toHaveLength(2);
      expect(authState.refreshCalls[0].forceRefresh).toBe(false);
      expect(authState.refreshCalls[1].forceRefresh).toBe(true);
    });

    it("should NOT retry on 400 Bad Request", async () => {
      let restCallCount = 0;

      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/async/status`,
          () => {
            restCallCount++;
            return HttpResponse.json(
              { message: "Bad Request - invalid query" },
              { status: 400 },
            );
          },
        ),
      );

      // Execute the request - should throw without retry
      await expect(
        mceBridgeService.request(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
          method: "GET",
          url: "/data/v1/async/status",
        }),
      ).rejects.toThrow(AppError);

      // Verify NO retry happened
      expect(restCallCount).toBe(1);

      // Verify NO invalidation was called
      expect(authState.invalidateCalls).toHaveLength(0);

      // Verify only one refresh call (initial)
      expect(authState.refreshCalls).toHaveLength(1);
    });

    it("should NOT retry on 500 Server Error", async () => {
      let restCallCount = 0;

      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/async/status`,
          () => {
            restCallCount++;
            return HttpResponse.json(
              { message: "Internal Server Error" },
              { status: 500 },
            );
          },
        ),
      );

      // Execute the request - should throw without retry
      await expect(
        mceBridgeService.request(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
          method: "GET",
          url: "/data/v1/async/status",
        }),
      ).rejects.toThrow(AppError);

      // Verify NO retry happened
      expect(restCallCount).toBe(1);

      // Verify NO invalidation was called
      expect(authState.invalidateCalls).toHaveLength(0);
    });

    it("should throw MCE_AUTH_EXPIRED after retry also returns 401", async () => {
      let restCallCount = 0;

      // Both REST calls return 401
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/async/status`,
          () => {
            restCallCount++;
            return HttpResponse.json(
              { message: "Unauthorized" },
              { status: 401 },
            );
          },
        ),
      );

      // Execute the request - should retry once then fail
      const promise = mceBridgeService.request(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        {
          method: "GET",
          url: "/data/v1/async/status",
        },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_AUTH_EXPIRED,
      });

      // Verify retry happened
      expect(restCallCount).toBe(2);

      // Verify invalidation was called
      expect(authState.invalidateCalls).toHaveLength(1);
    });

    it("should throw original 403 error without retry", async () => {
      let restCallCount = 0;

      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/async/status`,
          () => {
            restCallCount++;
            return HttpResponse.json({ message: "Forbidden" }, { status: 403 });
          },
        ),
      );

      const promise = mceBridgeService.request(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        {
          method: "GET",
          url: "/data/v1/async/status",
        },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_FORBIDDEN,
      });

      // Verify NO retry
      expect(restCallCount).toBe(1);
      expect(authState.invalidateCalls).toHaveLength(0);
    });
  });

  describe("SOAP Login Failed retry", () => {
    it("should retry SOAP request after Login Failed fault with token refresh", async () => {
      let soapCallCount = 0;

      // SOAP fault response for Login Failed
      const soapFaultResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Security</faultcode>
      <faultstring>Login Failed</faultstring>
      <detail>
        <fault>
          <message>Token expired or invalid</message>
        </fault>
      </detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      // SOAP success response
      const soapSuccessResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <RetrieveResponseMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
      <OverallStatus>OK</OverallStatus>
      <RequestID>test-soap-request-id</RequestID>
    </RetrieveResponseMsg>
  </soap:Body>
</soap:Envelope>`;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            soapCallCount++;
            if (soapCallCount === 1) {
              return HttpResponse.xml(soapFaultResponse);
            }
            return HttpResponse.xml(soapSuccessResponse);
          },
        ),
      );

      const soapBody = `<RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <RetrieveRequest>
          <ObjectType>DataFolder</ObjectType>
        </RetrieveRequest>
      </RetrieveRequestMsg>`;

      // Execute the SOAP request
      const result = await mceBridgeService.soapRequest<{
        Body: { RetrieveResponseMsg: { OverallStatus: string } };
      }>(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, soapBody, "Retrieve");

      // Verify retry happened
      expect(soapCallCount).toBe(2);

      // Verify successful result
      expect(result.Body.RetrieveResponseMsg.OverallStatus).toBe("OK");

      // Verify token invalidation was called
      expect(authState.invalidateCalls).toHaveLength(1);
      expect(authState.invalidateCalls[0]).toEqual({
        tenantId: TEST_TENANT_ID,
        userId: TEST_USER_ID,
        mid: TEST_MID,
      });

      // Verify refresh was called twice: once initially, once with forceRefresh
      expect(authState.refreshCalls).toHaveLength(2);
      expect(authState.refreshCalls[0].forceRefresh).toBe(false);
      expect(authState.refreshCalls[1].forceRefresh).toBe(true);
    });

    it("should throw MCE_AUTH_EXPIRED after both SOAP attempts fail with Login Failed", async () => {
      let soapCallCount = 0;

      const soapFaultResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Security</faultcode>
      <faultstring>Login Failed</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      // Both SOAP calls return Login Failed
      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            soapCallCount++;
            return HttpResponse.xml(soapFaultResponse);
          },
        ),
      );

      const soapBody = "<TestRequest/>";

      // Execute the SOAP request - should retry once then fail
      const promise = mceBridgeService.soapRequest(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        soapBody,
        "Test",
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_AUTH_EXPIRED,
      });

      // Verify retry happened
      expect(soapCallCount).toBe(2);

      // Verify invalidation was called
      expect(authState.invalidateCalls).toHaveLength(1);
    });

    it("should NOT retry SOAP request on non-auth SOAP fault", async () => {
      let soapCallCount = 0;

      // Non-auth SOAP fault (missing faultcode Security or faultstring Login Failed)
      const nonAuthFault = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Invalid object type</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            soapCallCount++;
            return HttpResponse.xml(nonAuthFault);
          },
        ),
      );

      const soapBody = "<TestRequest/>";

      // Execute the SOAP request - should return parsed fault without retry
      const result = await mceBridgeService.soapRequest<{
        Body: { Fault: { faultcode: string; faultstring: string } };
      }>(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, soapBody, "Test");

      // Verify NO retry happened
      expect(soapCallCount).toBe(1);

      // Verify NO invalidation was called
      expect(authState.invalidateCalls).toHaveLength(0);

      // Verify fault was returned
      expect(result.Body.Fault.faultstring).toBe("Invalid object type");
    });

    it("should NOT retry when faultcode is Security but faultstring is not Login Failed", async () => {
      let soapCallCount = 0;

      // Security fault with different faultstring
      const securityFault = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Security</faultcode>
      <faultstring>Access Denied</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            soapCallCount++;
            return HttpResponse.xml(securityFault);
          },
        ),
      );

      const result = await mceBridgeService.soapRequest<{
        Body: { Fault: { faultstring: string } };
      }>(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "<Test/>", "Test");

      // Verify NO retry
      expect(soapCallCount).toBe(1);
      expect(authState.invalidateCalls).toHaveLength(0);
      expect(result.Body.Fault.faultstring).toBe("Access Denied");
    });

    it("should NOT retry when faultstring is Login Failed but faultcode is not Security", async () => {
      let soapCallCount = 0;

      // Login Failed fault with non-Security faultcode
      const nonSecurityFault = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Login Failed</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            soapCallCount++;
            return HttpResponse.xml(nonSecurityFault);
          },
        ),
      );

      const result = await mceBridgeService.soapRequest<{
        Body: { Fault: { faultstring: string } };
      }>(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, "<Test/>", "Test");

      // Verify NO retry
      expect(soapCallCount).toBe(1);
      expect(authState.invalidateCalls).toHaveLength(0);
      expect(result.Body.Fault.faultstring).toBe("Login Failed");
    });

    it("should handle HTTP error in SOAP request without retry", async () => {
      let soapCallCount = 0;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          () => {
            soapCallCount++;
            return HttpResponse.json({ error: "Bad Gateway" }, { status: 502 });
          },
        ),
      );

      await expect(
        mceBridgeService.soapRequest(
          TEST_TENANT_ID,
          TEST_USER_ID,
          TEST_MID,
          "<Test/>",
          "Test",
        ),
      ).rejects.toThrow(AppError);

      // Verify NO retry
      expect(soapCallCount).toBe(1);
      expect(authState.invalidateCalls).toHaveLength(0);
    });
  });

  describe("retry with different tokens", () => {
    it("should use refreshed token on retry request", async () => {
      const capturedTokens: string[] = [];

      // Capture the tokens used in each request
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/test`,
          ({ request }) => {
            const authHeader = request.headers.get("Authorization");
            if (authHeader) {
              capturedTokens.push(authHeader.replace("Bearer ", ""));
            }

            if (capturedTokens.length === 1) {
              return HttpResponse.json(
                { message: "Unauthorized" },
                { status: 401 },
              );
            }
            return HttpResponse.json({ success: true });
          },
        ),
      );

      await mceBridgeService.request(TEST_TENANT_ID, TEST_USER_ID, TEST_MID, {
        method: "GET",
        url: "/data/v1/test",
      });

      // Verify different tokens were used
      expect(capturedTokens).toHaveLength(2);
      expect(capturedTokens[0]).toBe("initial-access-token");
      expect(capturedTokens[1]).toBe("refreshed-access-token");
    });

    it("should use refreshed token on SOAP retry request", async () => {
      const capturedTokens: string[] = [];

      const soapFaultResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Security</faultcode>
      <faultstring>Login Failed</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

      const soapSuccessResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Response><Status>OK</Status></Response>
  </soap:Body>
</soap:Envelope>`;

      server.use(
        http.post(
          `https://${TEST_TSSD}.soap.marketingcloudapis.com/Service.asmx`,
          async ({ request }) => {
            const body = await request.text();
            // Extract token from SOAP envelope
            const tokenMatch = body.match(
              /<fueloauth[^>]*>([^<]+)<\/fueloauth>/,
            );
            if (tokenMatch) {
              capturedTokens.push(tokenMatch[1]);
            }

            if (capturedTokens.length === 1) {
              return HttpResponse.xml(soapFaultResponse);
            }
            return HttpResponse.xml(soapSuccessResponse);
          },
        ),
      );

      await mceBridgeService.soapRequest(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "<Test/>",
        "Test",
      );

      // Verify different tokens were used
      expect(capturedTokens).toHaveLength(2);
      expect(capturedTokens[0]).toBe("initial-access-token");
      expect(capturedTokens[1]).toBe("refreshed-access-token");
    });
  });
});
