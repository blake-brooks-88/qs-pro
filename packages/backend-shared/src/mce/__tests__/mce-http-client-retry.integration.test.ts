/**
 * MceHttpClient Retry Logic Integration Tests
 *
 * Tests the withRetry utility with real HTTP calls via MSW.
 * Verifies retry behavior for 429 and 5xx errors.
 *
 * Test Strategy:
 * - Real NestJS module with actual MceHttpClient
 * - MSW for MCE API mocking (external boundary only)
 * - Stateful handlers to track retry attempts
 * - Behavioral assertions via call counts and return values
 */
import { ConfigService } from "@nestjs/config";
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
import { withRetry } from "../http-retry.util";
import { MceHttpClient } from "../mce-http-client";

const TEST_BASE_URL = "https://test.rest.marketingcloudapis.com";

const server = setupServer();

describe("MceHttpClient retry integration", () => {
  let module: TestingModule;
  let httpClient: MceHttpClient;

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: "error" });
  });

  beforeEach(async () => {
    server.resetHandlers();

    module = await Test.createTestingModule({
      providers: [
        MceHttpClient,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              key === "OUTBOUND_HOST_POLICY" ? "log" : fallback,
          },
        },
      ],
    }).compile();

    httpClient = module.get<MceHttpClient>(MceHttpClient);
  });

  afterEach(async () => {
    await module.close();
  });

  afterAll(async () => {
    server.close();
    await module.close();
  });

  describe("429 Rate Limit retry", () => {
    it("retries after 429 and succeeds on next attempt", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json(
              { message: "Rate limit exceeded" },
              { status: 429 },
            );
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const result = await withRetry(
        () =>
          httpClient.request<{ success: boolean }>({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10, maxDelayMs: 100 }, // Fast retries for tests
      );

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });

    it("respects Retry-After header", async () => {
      let callCount = 0;
      const startTime = Date.now();

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json(
              { message: "Rate limit exceeded" },
              {
                status: 429,
                headers: { "Retry-After": "1" }, // 1 second
              },
            );
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const result = await withRetry(
        () =>
          httpClient.request<{ success: boolean }>({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 }, // Would be 10ms without Retry-After
      );

      const elapsed = Date.now() - startTime;

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
      // Should have waited ~1000ms due to Retry-After header
      expect(elapsed).toBeGreaterThanOrEqual(950);
    });

    it("throws MCE_RATE_LIMITED after max retries exhausted", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          return HttpResponse.json(
            { message: "Rate limit exceeded" },
            { status: 429 },
          );
        }),
      );

      const promise = withRetry(
        () =>
          httpClient.request({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { maxRetries: 2, baseDelayMs: 10 },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_RATE_LIMITED,
      });

      // 1 initial + 2 retries = 3 calls
      expect(callCount).toBe(3);
    });
  });

  describe("5xx Server Error retry", () => {
    it("retries after 500 and succeeds on next attempt", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json(
              { message: "Internal Server Error" },
              { status: 500 },
            );
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const result = await withRetry(
        () =>
          httpClient.request<{ success: boolean }>({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });

    it("retries after 502 Bad Gateway", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json(
              { message: "Bad Gateway" },
              { status: 502 },
            );
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const result = await withRetry(
        () =>
          httpClient.request<{ success: boolean }>({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });

    it("retries after 503 Service Unavailable", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json(
              { message: "Service Unavailable" },
              { status: 503 },
            );
          }
          return HttpResponse.json({ success: true });
        }),
      );

      const result = await withRetry(
        () =>
          httpClient.request<{ success: boolean }>({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);
    });
  });

  describe("Non-retryable errors", () => {
    it("does NOT retry 400 Bad Request", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          return HttpResponse.json(
            { message: "Invalid request" },
            { status: 400 },
          );
        }),
      );

      const promise = withRetry(
        () =>
          httpClient.request({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST,
      });

      // No retry - only 1 call
      expect(callCount).toBe(1);
    });

    it("does NOT retry 403 Forbidden", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          return HttpResponse.json({ message: "Forbidden" }, { status: 403 });
        }),
      );

      const promise = withRetry(
        () =>
          httpClient.request({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_FORBIDDEN,
      });

      // No retry - only 1 call
      expect(callCount).toBe(1);
    });

    it("does NOT retry 401 Unauthorized", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          return HttpResponse.json(
            { message: "Unauthorized" },
            { status: 401 },
          );
        }),
      );

      const promise = withRetry(
        () =>
          httpClient.request({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_AUTH_EXPIRED,
      });

      // No retry - only 1 call
      expect(callCount).toBe(1);
    });

    it("does NOT retry 404 Not Found", async () => {
      let callCount = 0;

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callCount++;
          return HttpResponse.json({ message: "Not found" }, { status: 404 });
        }),
      );

      const promise = withRetry(
        () =>
          httpClient.request({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 10 },
      );

      await expect(promise).rejects.toThrow(AppError);
      await expect(promise).rejects.toMatchObject({
        code: ErrorCode.MCE_BAD_REQUEST, // 404 maps to BAD_REQUEST in current impl
      });

      // No retry - only 1 call
      expect(callCount).toBe(1);
    });
  });

  describe("Exponential backoff", () => {
    it("increases delay between retries", async () => {
      const callTimes: number[] = [];

      server.use(
        http.get(`${TEST_BASE_URL}/data/v1/test`, () => {
          callTimes.push(Date.now());
          if (callTimes.length < 3) {
            return HttpResponse.json(
              { message: "Server Error" },
              { status: 500 },
            );
          }
          return HttpResponse.json({ success: true });
        }),
      );

      await withRetry(
        () =>
          httpClient.request<{ success: boolean }>({
            method: "GET",
            url: `${TEST_BASE_URL}/data/v1/test`,
          }),
        { baseDelayMs: 50, jitterRange: 0 }, // No jitter for predictable timing
      );

      expect(callTimes).toHaveLength(3);

      // Access as tuple after assertion guarantees elements exist
      const [time0, time1, time2] = callTimes as [number, number, number];

      // First delay should be ~50ms (attempt 0)
      const firstDelay = time1 - time0;
      expect(firstDelay).toBeGreaterThanOrEqual(45);
      expect(firstDelay).toBeLessThan(100);

      // Second delay should be ~100ms (attempt 1: 50 * 2^1)
      const secondDelay = time2 - time1;
      expect(secondDelay).toBeGreaterThanOrEqual(90);
      expect(secondDelay).toBeLessThan(150);
    });
  });
});
