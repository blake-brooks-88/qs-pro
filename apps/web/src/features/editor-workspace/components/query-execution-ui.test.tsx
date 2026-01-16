import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResultsPane } from "@/features/editor-workspace/components/ResultsPane";
import type {
  ExecutionResult,
  ExecutionStatus,
} from "@/features/editor-workspace/types";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const baseExecutionResult: ExecutionResult = {
  status: "idle",
  runtime: "0ms",
  totalRows: 0,
  currentPage: 1,
  pageSize: 100,
  columns: [],
  rows: [],
};

describe("Query Execution UI Components", () => {
  const mockSessionStorage = new Map<string, string>();

  beforeEach(() => {
    mockSessionStorage.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => mockSessionStorage.get(key) ?? null,
      setItem: (key: string, value: string) =>
        mockSessionStorage.set(key, value),
      removeItem: (key: string) => mockSessionStorage.delete(key),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("ResultsPane", () => {
    it("shows cancel button during non-terminal states", () => {
      const onCancel = vi.fn();
      const queryClient = createQueryClient();

      const result: ExecutionResult = {
        ...baseExecutionResult,
        status: "running",
        executionStatus: "executing_query",
      };

      render(<ResultsPane result={result} onCancel={onCancel} />, {
        wrapper: createWrapper(queryClient),
      });

      const cancelButton = screen.getByTestId("cancel-button");
      expect(cancelButton).toBeInTheDocument();
    });

    it("hides cancel button on terminal states", () => {
      const onCancel = vi.fn();
      const queryClient = createQueryClient();

      const terminalStatuses: ExecutionStatus[] = [
        "ready",
        "failed",
        "canceled",
        "idle",
      ];

      terminalStatuses.forEach((status) => {
        const result: ExecutionResult = {
          ...baseExecutionResult,
          status:
            status === "ready"
              ? "success"
              : status === "idle"
                ? "idle"
                : "error",
          executionStatus: status,
        };

        const { unmount } = render(
          <ResultsPane result={result} onCancel={onCancel} />,
          {
            wrapper: createWrapper(queryClient),
          },
        );

        expect(screen.queryByTestId("cancel-button")).not.toBeInTheDocument();
        unmount();
      });
    });

    it("shows correct status message for each state", () => {
      const queryClient = createQueryClient();

      const statusTests: Array<{
        executionStatus: ExecutionStatus;
        expectedMessage: string;
        legacyStatus: "idle" | "running" | "success" | "error";
      }> = [
        {
          executionStatus: "queued",
          expectedMessage: "Queued...",
          legacyStatus: "running",
        },
        {
          executionStatus: "creating_data_extension",
          expectedMessage: "Creating temp Data Extension...",
          legacyStatus: "running",
        },
        {
          executionStatus: "validating_query",
          expectedMessage: "Validating query...",
          legacyStatus: "running",
        },
        {
          executionStatus: "executing_query",
          expectedMessage: "Executing query...",
          legacyStatus: "running",
        },
        {
          executionStatus: "fetching_results",
          expectedMessage: "Fetching results...",
          legacyStatus: "running",
        },
        {
          executionStatus: "canceled",
          expectedMessage: "Query canceled",
          legacyStatus: "error",
        },
      ];

      statusTests.forEach(
        ({ executionStatus, expectedMessage, legacyStatus }) => {
          const result: ExecutionResult = {
            ...baseExecutionResult,
            status: legacyStatus,
            executionStatus,
          };

          const { unmount } = render(<ResultsPane result={result} />, {
            wrapper: createWrapper(queryClient),
          });

          expect(screen.getByTestId("status-message")).toHaveTextContent(
            expectedMessage,
          );
          unmount();
        },
      );
    });

    it("shows error message when status is failed", () => {
      const queryClient = createQueryClient();

      const result: ExecutionResult = {
        ...baseExecutionResult,
        status: "error",
        executionStatus: "failed",
        errorMessage: "Invalid SQL syntax",
      };

      render(<ResultsPane result={result} />, {
        wrapper: createWrapper(queryClient),
      });

      expect(screen.getByTestId("status-message")).toHaveTextContent(
        "Query failed: Invalid SQL syntax",
      );
    });

    it("shows spinner for in-progress states", () => {
      const queryClient = createQueryClient();

      const inProgressStatuses: ExecutionStatus[] = [
        "queued",
        "creating_data_extension",
        "validating_query",
        "executing_query",
        "fetching_results",
      ];

      inProgressStatuses.forEach((status) => {
        const result: ExecutionResult = {
          ...baseExecutionResult,
          status: "running",
          executionStatus: status,
        };

        const { unmount } = render(<ResultsPane result={result} />, {
          wrapper: createWrapper(queryClient),
        });

        expect(screen.getByTestId("status-spinner")).toBeInTheDocument();
        unmount();
      });
    });

    it("calls onCancel when cancel button is clicked", () => {
      const onCancel = vi.fn();
      const queryClient = createQueryClient();

      const result: ExecutionResult = {
        ...baseExecutionResult,
        status: "running",
        executionStatus: "executing_query",
      };

      render(<ResultsPane result={result} onCancel={onCancel} />, {
        wrapper: createWrapper(queryClient),
      });

      fireEvent.click(screen.getByTestId("cancel-button"));

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
