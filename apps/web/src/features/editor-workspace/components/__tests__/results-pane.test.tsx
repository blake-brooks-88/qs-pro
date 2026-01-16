import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ExecutionResult } from "@/features/editor-workspace/types";

import { ResultsPane } from "../ResultsPane";

function createMockResult(
  overrides: Partial<ExecutionResult> = {},
): ExecutionResult {
  return {
    status: "idle",
    executionStatus: "idle",
    runtime: "",
    columns: [],
    rows: [],
    totalRows: 0,
    currentPage: 1,
    pageSize: 50,
    ...overrides,
  };
}

describe("ResultsPane UI Component Tests", () => {
  describe("Status messages display correctly per state", () => {
    it("shows 'Queued...' when status is queued", () => {
      const result = createMockResult({
        status: "running",
        executionStatus: "queued",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Queued...",
      );
      expect(screen.getByTestId("status-spinner")).toBeInTheDocument();
    });

    it("shows 'Creating temp Data Extension...' when creating DE", () => {
      const result = createMockResult({
        status: "running",
        executionStatus: "creating_data_extension",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Creating temp Data Extension...",
      );
    });

    it("shows 'Validating query...' when validating", () => {
      const result = createMockResult({
        status: "running",
        executionStatus: "validating_query",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Validating query...",
      );
    });

    it("shows 'Executing query...' when executing", () => {
      const result = createMockResult({
        status: "running",
        executionStatus: "executing_query",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Executing query...",
      );
    });

    it("shows 'Fetching results...' when fetching results", () => {
      const result = createMockResult({
        status: "running",
        executionStatus: "fetching_results",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Fetching results...",
      );
    });

    it("shows success message with runtime and row count when ready", () => {
      const result = createMockResult({
        status: "success",
        executionStatus: "ready",
        runtime: "1.2s",
        totalRows: 150,
        columns: ["ID", "Name"],
        rows: [{ ID: 1, Name: "Test" }],
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Query executed in 1.2s - 150 records found",
      );
      expect(screen.queryByTestId("status-spinner")).not.toBeInTheDocument();
    });

    it("shows 'Query failed: {errorMessage}' when failed", () => {
      const result = createMockResult({
        status: "error",
        executionStatus: "failed",
        errorMessage: "Syntax error near SELECT",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Query failed: Syntax error near SELECT",
      );
    });

    it("shows 'Query canceled' when canceled", () => {
      const result = createMockResult({
        status: "error",
        executionStatus: "canceled",
      });

      render(<ResultsPane result={result} />);

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Query canceled",
      );
    });
  });

  describe("Cancel button visibility", () => {
    it("shows Cancel button during queued state", () => {
      const onCancel = vi.fn();
      const result = createMockResult({
        status: "running",
        executionStatus: "queued",
      });

      render(<ResultsPane result={result} onCancel={onCancel} />);

      expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
    });

    it("shows Cancel button during executing_query state", () => {
      const onCancel = vi.fn();
      const result = createMockResult({
        status: "running",
        executionStatus: "executing_query",
      });

      render(<ResultsPane result={result} onCancel={onCancel} />);

      expect(screen.getByTestId("cancel-button")).toBeInTheDocument();
    });

    it("hides Cancel button when status is ready", () => {
      const onCancel = vi.fn();
      const result = createMockResult({
        status: "success",
        executionStatus: "ready",
      });

      render(<ResultsPane result={result} onCancel={onCancel} />);

      expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();
    });

    it("hides Cancel button when status is failed", () => {
      const onCancel = vi.fn();
      const result = createMockResult({
        status: "error",
        executionStatus: "failed",
      });

      render(<ResultsPane result={result} onCancel={onCancel} />);

      expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();
    });

    it("hides Cancel button when status is canceled", () => {
      const onCancel = vi.fn();
      const result = createMockResult({
        status: "error",
        executionStatus: "canceled",
      });

      render(<ResultsPane result={result} onCancel={onCancel} />);

      expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();
    });

    it("calls onCancel when Cancel button is clicked", () => {
      const onCancel = vi.fn();
      const result = createMockResult({
        status: "running",
        executionStatus: "executing_query",
      });

      render(<ResultsPane result={result} onCancel={onCancel} />);

      fireEvent.click(screen.getByTestId("cancel-button"));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("Spinner visibility during in-progress states", () => {
    it("shows spinner during all in-progress states", () => {
      const inProgressStates = [
        "queued",
        "creating_data_extension",
        "validating_query",
        "executing_query",
        "fetching_results",
      ] as const;

      for (const executionStatus of inProgressStates) {
        const result = createMockResult({
          status: "running",
          executionStatus,
        });

        const { unmount } = render(<ResultsPane result={result} />);

        expect(
          screen.getByTestId("status-spinner"),
          `Spinner should be visible for ${executionStatus}`,
        ).toBeInTheDocument();

        unmount();
      }
    });

    it("hides spinner on terminal states", () => {
      const terminalStates = ["ready", "failed", "canceled"] as const;

      for (const executionStatus of terminalStates) {
        const status = executionStatus === "ready" ? "success" : "error";
        const result = createMockResult({
          status,
          executionStatus,
        });

        const { unmount } = render(<ResultsPane result={result} />);

        expect(
          screen.queryByTestId("status-spinner"),
          `Spinner should be hidden for ${executionStatus}`,
        ).not.toBeInTheDocument();

        unmount();
      }
    });
  });
});
