import { describe, expect, test } from "vitest";

import type { ExecutionResult } from "@/features/editor-workspace/types";

import { adaptExecutionResult } from "./execution-result-adapter";

const baseExternal: ExecutionResult = {
  status: "idle",
  runtime: "0ms",
  totalRows: 0,
  currentPage: 1,
  pageSize: 100,
  columns: ["a"],
  rows: [{ a: 1 }],
};

describe("adaptExecutionResult", () => {
  test("maps executionStatus to legacy status", () => {
    expect(
      adaptExecutionResult({
        externalExecutionResult: baseExternal,
        executionStatus: "ready",
        runId: null,
        executionErrorMessage: null,
        resultsData: null,
        resultsError: null,
        currentPage: 1,
      }).status,
    ).toBe("success");

    expect(
      adaptExecutionResult({
        externalExecutionResult: baseExternal,
        executionStatus: "failed",
        runId: null,
        executionErrorMessage: null,
        resultsData: null,
        resultsError: null,
        currentPage: 1,
      }).status,
    ).toBe("error");

    expect(
      adaptExecutionResult({
        externalExecutionResult: baseExternal,
        executionStatus: "queued",
        runId: null,
        executionErrorMessage: null,
        resultsData: null,
        resultsError: null,
        currentPage: 1,
      }).status,
    ).toBe("running");
  });

  test("prefers executionErrorMessage over resultsError and external", () => {
    const result = adaptExecutionResult({
      externalExecutionResult: { ...baseExternal, errorMessage: "external" },
      executionStatus: "failed",
      runId: null,
      executionErrorMessage: "from hook",
      resultsData: null,
      resultsError: new Error("from query"),
      currentPage: 1,
    });

    expect(result.errorMessage).toBe("from hook");
  });

  test("uses resultsData fields when available", () => {
    const result = adaptExecutionResult({
      externalExecutionResult: baseExternal,
      executionStatus: "ready",
      runId: "run-1",
      executionErrorMessage: null,
      resultsData: {
        columns: ["email"],
        rows: [{ email: "a@b.com" }],
        totalRows: 1,
        page: 2,
        pageSize: 50,
      },
      resultsError: null,
      currentPage: 99,
    });

    expect(result.runId).toBe("run-1");
    expect(result.columns).toEqual(["email"]);
    expect(result.rows).toEqual([{ email: "a@b.com" }]);
    expect(result.totalRows).toBe(1);
    expect(result.currentPage).toBe(2);
    expect(result.pageSize).toBe(50);
  });
});
