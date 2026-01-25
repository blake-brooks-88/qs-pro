/**
 * Tests for Web Worker lifecycle and message protocol.
 *
 * Since jsdom doesn't support Web Workers, these tests verify the worker's
 * message handling logic by testing the protocol types and simulating
 * the message flow.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type {
  ErrorResponse,
  InitRequest,
  LintRequest,
  LintResponse,
  ReadyResponse,
  WorkerResponse,
} from "../parser/protocol";
import { createRequestId } from "../parser/protocol";
import type { SqlDiagnostic } from "../types";

describe("Worker Lifecycle", () => {
  describe("Protocol Types", () => {
    test("InitRequest_has_correct_shape", () => {
      const request: InitRequest = { type: "init" };
      expect(request.type).toBe("init");
    });

    test("LintRequest_has_correct_shape", () => {
      const request: LintRequest = {
        type: "lint",
        requestId: "test-123",
        sql: "SELECT 1",
      };
      expect(request.type).toBe("lint");
      expect(request.requestId).toBe("test-123");
      expect(request.sql).toBe("SELECT 1");
    });

    test("ReadyResponse_has_correct_shape", () => {
      const response: ReadyResponse = { type: "ready" };
      expect(response.type).toBe("ready");
    });

    test("LintResponse_has_correct_shape", () => {
      const diagnostics: SqlDiagnostic[] = [
        { message: "Test", severity: "error", startIndex: 0, endIndex: 4 },
      ];
      const response: LintResponse = {
        type: "lint-result",
        requestId: "test-123",
        diagnostics,
        duration: 42,
      };
      expect(response.type).toBe("lint-result");
      expect(response.requestId).toBe("test-123");
      expect(response.diagnostics).toEqual(diagnostics);
      expect(response.duration).toBe(42);
    });

    test("ErrorResponse_has_correct_shape", () => {
      const response: ErrorResponse = {
        type: "error",
        requestId: "test-123",
        message: "Something went wrong",
      };
      expect(response.type).toBe("error");
      expect(response.requestId).toBe("test-123");
      expect(response.message).toBe("Something went wrong");
    });

    test("ErrorResponse_allows_undefined_requestId", () => {
      const response: ErrorResponse = {
        type: "error",
        message: "Unknown error",
      };
      expect(response.type).toBe("error");
      expect(response.requestId).toBeUndefined();
      expect(response.message).toBe("Unknown error");
    });
  });

  describe("createRequestId", () => {
    test("generates_unique_ids", () => {
      const id1 = createRequestId();
      const id2 = createRequestId();
      expect(id1).not.toBe(id2);
    });

    test("includes_lint_prefix", () => {
      const id = createRequestId();
      expect(id).toMatch(/^lint-/);
    });

    test("includes_timestamp", () => {
      const before = Date.now();
      const id = createRequestId();
      const after = Date.now();

      // Extract timestamp from id (format: lint-{timestamp}-{random})
      const parts = id.split("-");
      expect(parts).toHaveLength(3);
      const timestamp = parseInt(parts[1] ?? "0", 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    test("includes_random_suffix", () => {
      const id = createRequestId();
      const parts = id.split("-");
      const suffix = parts[2];

      // Suffix should be 7 characters (from .slice(2, 9) on base36 random)
      expect(suffix).toBeDefined();
      expect(suffix?.length).toBe(7);
    });
  });

  describe("Worker Message Handling Simulation", () => {
    let postedMessages: WorkerResponse[];

    beforeEach(() => {
      postedMessages = [];
      // Mock self.postMessage to capture responses
      vi.stubGlobal("self", {
        postMessage: (msg: WorkerResponse) => {
          postedMessages.push(msg);
        },
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test("simulated_init_message_flow", async () => {
      // Dynamically import to get fresh module with mocked self
      const { parseAndLint } = await import("../parser/ast-parser");

      // Simulate what the worker does on init
      try {
        parseAndLint("SELECT 1");
        const response: ReadyResponse = { type: "ready" };
        self.postMessage(response);
      } catch {
        const response: ReadyResponse = { type: "ready" };
        self.postMessage(response);
      }

      expect(postedMessages).toHaveLength(1);
      expect(postedMessages[0]).toEqual({ type: "ready" });
    });

    test("simulated_lint_message_flow_valid_sql", async () => {
      const { parseAndLint } = await import("../parser/ast-parser");
      const requestId = "test-lint-123";
      const sql = "SELECT ID FROM Contacts";

      // Simulate what the worker does on lint
      const startTime = performance.now();
      const diagnostics = parseAndLint(sql);
      const duration = performance.now() - startTime;

      const response: LintResponse = {
        type: "lint-result",
        requestId,
        diagnostics,
        duration,
      };
      self.postMessage(response);

      expect(postedMessages).toHaveLength(1);
      const posted = postedMessages[0] as LintResponse;
      expect(posted.type).toBe("lint-result");
      expect(posted.requestId).toBe(requestId);
      expect(posted.diagnostics).toEqual([]);
      expect(posted.duration).toBeGreaterThanOrEqual(0);
    });

    test("simulated_lint_message_flow_invalid_sql", async () => {
      const { parseAndLint } = await import("../parser/ast-parser");
      const requestId = "test-lint-456";
      const sql = "INSERT INTO Contacts (Name) VALUES ('Test')";

      const diagnostics = parseAndLint(sql);

      const response: LintResponse = {
        type: "lint-result",
        requestId,
        diagnostics,
        duration: 0,
      };
      self.postMessage(response);

      expect(postedMessages).toHaveLength(1);
      const posted = postedMessages[0] as LintResponse;
      expect(posted.type).toBe("lint-result");
      expect(posted.diagnostics.length).toBeGreaterThan(0);
      expect(posted.diagnostics[0]?.severity).toBe("error");
    });

    test("simulated_error_response_for_unknown_type", () => {
      const unknownRequest = { type: "unknown" } as unknown;
      const requestType = (unknownRequest as { type: string }).type;

      const response: ErrorResponse = {
        type: "error",
        requestId: undefined,
        message: `Unknown request type: ${requestType}`,
      };
      self.postMessage(response);

      expect(postedMessages).toHaveLength(1);
      const posted = postedMessages[0] as ErrorResponse;
      expect(posted.type).toBe("error");
      expect(posted.message).toBe("Unknown request type: unknown");
    });

    test("simulated_error_response_with_requestId", () => {
      const requestId = "error-test-789";
      const errorMessage = "Parser crashed unexpectedly";

      const response: ErrorResponse = {
        type: "error",
        requestId,
        message: errorMessage,
      };
      self.postMessage(response);

      expect(postedMessages).toHaveLength(1);
      const posted = postedMessages[0] as ErrorResponse;
      expect(posted.type).toBe("error");
      expect(posted.requestId).toBe(requestId);
      expect(posted.message).toBe(errorMessage);
    });
  });

  describe("Worker Response Type Discrimination", () => {
    test("discriminate_ready_response", () => {
      const response: WorkerResponse = { type: "ready" };

      // Type narrowing works via discriminated union
      expect(response.type).toBe("ready");
      expect(response).toEqual({ type: "ready" });
    });

    test("discriminate_lint_result_response", () => {
      const response: WorkerResponse = {
        type: "lint-result",
        requestId: "test",
        diagnostics: [],
        duration: 10,
      };

      // Type narrowing allows access to LintResponse properties
      expect(response.type).toBe("lint-result");
      // After type check, TypeScript knows full shape
      const lintResponse = response as LintResponse;
      expect(lintResponse.requestId).toBe("test");
      expect(lintResponse.diagnostics).toEqual([]);
      expect(lintResponse.duration).toBe(10);
    });

    test("discriminate_error_response", () => {
      const response: WorkerResponse = {
        type: "error",
        requestId: "test",
        message: "Error occurred",
      };

      // Type narrowing allows access to ErrorResponse properties
      expect(response.type).toBe("error");
      const errorResponse = response as ErrorResponse;
      expect(errorResponse.requestId).toBe("test");
      expect(errorResponse.message).toBe("Error occurred");
    });
  });

  describe("Duration Tracking", () => {
    test("duration_is_non_negative", async () => {
      const { parseAndLint } = await import("../parser/ast-parser");
      const sql =
        "SELECT ID, Name, Email FROM Contacts WHERE Status = 'Active'";

      const startTime = performance.now();
      parseAndLint(sql);
      const duration = performance.now() - startTime;

      expect(duration).toBeGreaterThanOrEqual(0);
    });

    test("complex_query_takes_measurable_time", async () => {
      const { parseAndLint } = await import("../parser/ast-parser");
      // Build a moderately complex query
      const sql = `
        SELECT
          c.ID,
          c.Name,
          COUNT(o.ID) AS OrderCount,
          SUM(o.Amount) AS TotalAmount
        FROM Contacts c
        LEFT JOIN Orders o ON c.ID = o.ContactID
        WHERE c.Status = 'Active'
        GROUP BY c.ID, c.Name
        HAVING COUNT(o.ID) > 0
        ORDER BY TotalAmount DESC
      `;

      const startTime = performance.now();
      parseAndLint(sql);
      const duration = performance.now() - startTime;

      // Should complete in reasonable time (less than 1 second)
      expect(duration).toBeLessThan(1000);
    });
  });
});
