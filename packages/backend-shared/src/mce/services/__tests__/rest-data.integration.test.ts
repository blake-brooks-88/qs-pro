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
import { RestDataService } from "../rest-data.service";

const TEST_TSSD = "test-rest-tssd";
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

// Track captured request info
let capturedUrl = "";
let capturedAuthHeader = "";

const server = setupServer();

describe("RestDataService (integration)", () => {
  let module: TestingModule;
  let service: RestDataService;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "error" });

    module = await Test.createTestingModule({
      providers: [
        RestDataService,
        MceBridgeService,
        MceHttpClient,
        { provide: MCE_AUTH_PROVIDER, useValue: stubAuthProvider },
      ],
    }).compile();

    service = module.get(RestDataService);
  });

  beforeEach(() => {
    capturedUrl = "";
    capturedAuthHeader = "";
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(async () => {
    server.close();
    await module.close();
  });

  describe("getRowset", () => {
    it("sends correct URL with pagination params", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:deName/rowset`,
          async ({ request, params }) => {
            capturedUrl = request.url;
            capturedAuthHeader = request.headers.get("authorization") ?? "";

            expect(params.deName).toBe("MyDataExtension");

            return HttpResponse.json({
              count: 2,
              page: 1,
              pageSize: 50,
              items: [
                {
                  keys: { Email: "a@test.com" },
                  values: { FirstName: "Alice" },
                },
                { keys: { Email: "b@test.com" }, values: { FirstName: "Bob" } },
              ],
            });
          },
        ),
      );

      await service.getRowset(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "MyDataExtension",
        1,
        50,
      );

      // Verify URL contains pagination params
      expect(capturedUrl).toContain("$page=1");
      expect(capturedUrl).toContain("$pageSize=50");
    });

    it("includes Bearer token in Authorization header", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:deName/rowset`,
          async ({ request }) => {
            capturedAuthHeader = request.headers.get("authorization") ?? "";

            return HttpResponse.json({
              count: 0,
              page: 1,
              pageSize: 50,
              items: [],
            });
          },
        ),
      );

      await service.getRowset(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "TestDE",
        1,
        50,
      );

      expect(capturedAuthHeader).toBe("Bearer test-access-token");
    });

    it("parses rowset response with items", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:deName/rowset`,
          async () => {
            return HttpResponse.json({
              count: 3,
              page: 2,
              pageSize: 100,
              items: [
                {
                  keys: { Id: "1" },
                  values: { Email: "user1@test.com", Age: 25 },
                },
                {
                  keys: { Id: "2" },
                  values: { Email: "user2@test.com", Age: 30 },
                },
                {
                  keys: { Id: "3" },
                  values: { Email: "user3@test.com", Age: 35 },
                },
              ],
            });
          },
        ),
      );

      const result = await service.getRowset(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "Subscribers",
        2,
        100,
      );

      expect(result.count).toBe(3);
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(100);
      expect(result.items).toHaveLength(3);
      expect(result.items?.[0]).toEqual({
        keys: { Id: "1" },
        values: { Email: "user1@test.com", Age: 25 },
      });
    });

    it("handles empty rowset response", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:deName/rowset`,
          async () => {
            return HttpResponse.json({
              count: 0,
              page: 1,
              pageSize: 50,
              items: [],
            });
          },
        ),
      );

      const result = await service.getRowset(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "EmptyDE",
        1,
        50,
      );

      expect(result.count).toBe(0);
      expect(result.items).toHaveLength(0);
    });

    it("encodes data extension name in URL", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/data/v1/customobjectdata/key/:deName/rowset`,
          async ({ params }) => {
            // MSW decodes the param, so we verify the decoded value
            expect(params.deName).toBe("My DE With Spaces");

            return HttpResponse.json({
              count: 0,
              page: 1,
              pageSize: 50,
              items: [],
            });
          },
        ),
      );

      await service.getRowset(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "My DE With Spaces",
        1,
        50,
      );
    });
  });

  describe("checkIsRunning", () => {
    it("sends correct URL for isRunning check", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:queryId/actions/isrunning/`,
          async ({ params, request }) => {
            capturedUrl = request.url;
            capturedAuthHeader = request.headers.get("authorization") ?? "";

            expect(params.queryId).toBe("query-id-abc");

            return HttpResponse.json({ isRunning: true });
          },
        ),
      );

      await service.checkIsRunning(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "query-id-abc",
      );

      expect(capturedUrl).toContain(
        "/automation/v1/queries/query-id-abc/actions/isrunning/",
      );
    });

    it("includes Bearer token in Authorization header", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:queryId/actions/isrunning/`,
          async ({ request }) => {
            capturedAuthHeader = request.headers.get("authorization") ?? "";

            return HttpResponse.json({ isRunning: false });
          },
        ),
      );

      await service.checkIsRunning(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "query-123",
      );

      expect(capturedAuthHeader).toBe("Bearer test-access-token");
    });

    it("parses isRunning: true response", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:queryId/actions/isrunning/`,
          async () => {
            return HttpResponse.json({ isRunning: true });
          },
        ),
      );

      const result = await service.checkIsRunning(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "running-query",
      );

      expect(result).toEqual({ isRunning: true });
    });

    it("parses isRunning: false response", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:queryId/actions/isrunning/`,
          async () => {
            return HttpResponse.json({ isRunning: false });
          },
        ),
      );

      const result = await service.checkIsRunning(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "finished-query",
      );

      expect(result).toEqual({ isRunning: false });
    });

    it("encodes query ID in URL", async () => {
      server.use(
        http.get(
          `https://${TEST_TSSD}.rest.marketingcloudapis.com/automation/v1/queries/:queryId/actions/isrunning/`,
          async ({ params }) => {
            // MSW decodes the param
            expect(params.queryId).toBe("query/with/slashes");

            return HttpResponse.json({ isRunning: false });
          },
        ),
      );

      await service.checkIsRunning(
        TEST_TENANT_ID,
        TEST_USER_ID,
        TEST_MID,
        "query/with/slashes",
      );
    });
  });
});
