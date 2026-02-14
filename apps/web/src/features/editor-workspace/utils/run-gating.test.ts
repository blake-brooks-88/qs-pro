import { describe, expect, test } from "vitest";

import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-lint";

import {
  getRunBlockMessage,
  getRunLimitFlags,
  getRunTooltipMessage,
} from "./run-gating";

describe("run gating utils", () => {
  test("getRunLimitFlags returns false when limit is null", () => {
    expect(
      getRunLimitFlags(
        {
          queryRuns: { current: 10, limit: null, resetDate: "2026-03-01" },
          savedQueries: { current: 1, limit: null },
        },
        0.8,
      ),
    ).toEqual({ isAtRunLimit: false, isNearRunLimit: false });
  });

  test("getRunLimitFlags returns true at and near limit", () => {
    expect(
      getRunLimitFlags(
        {
          queryRuns: { current: 50, limit: 50, resetDate: "2026-03-01" },
          savedQueries: { current: 1, limit: null },
        },
        0.8,
      ),
    ).toEqual({ isAtRunLimit: true, isNearRunLimit: true });
  });

  test("getRunBlockMessage formats diagnostic with correct line number", () => {
    const diagnostic: SqlDiagnostic = {
      severity: "error",
      message: "Missing FROM clause",
      startIndex: "SELECT 1\n".length,
      endIndex: "SELECT 1\nSEL".length,
    };

    const sql = "SELECT 1\nSELECT";
    expect(getRunBlockMessage(diagnostic, sql)).toBe(
      "Line 2: Missing FROM clause",
    );
  });

  test("getRunTooltipMessage prioritizes running state", () => {
    expect(
      getRunTooltipMessage({
        isRunning: true,
        isAtRunLimit: true,
        hasBlockingDiagnostics: true,
        runBlockMessage: "Line 1: Missing SELECT",
      }),
    ).toBe("Query is currently running...");
  });

  test("getRunTooltipMessage shows upgrade message at run limit", () => {
    expect(
      getRunTooltipMessage({
        isRunning: false,
        isAtRunLimit: true,
        hasBlockingDiagnostics: false,
        runBlockMessage: null,
      }),
    ).toBe("Monthly run limit reached. Click to upgrade.");
  });

  test("getRunTooltipMessage uses runBlockMessage when blocked", () => {
    expect(
      getRunTooltipMessage({
        isRunning: false,
        isAtRunLimit: false,
        hasBlockingDiagnostics: true,
        runBlockMessage: "Line 3: Missing FROM clause",
      }),
    ).toBe("Line 3: Missing FROM clause");
  });

  test("getRunTooltipMessage defaults to execute hint", () => {
    expect(
      getRunTooltipMessage({
        isRunning: false,
        isAtRunLimit: false,
        hasBlockingDiagnostics: false,
        runBlockMessage: null,
      }),
    ).toBe("Execute SQL (Ctrl+Enter)");
  });
});
