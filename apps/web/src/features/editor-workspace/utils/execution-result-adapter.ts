import type { QueryExecutionStatus } from "@/features/editor-workspace/hooks/use-query-execution";
import type { RunResultsResponse } from "@/features/editor-workspace/hooks/use-run-results";
import type { ExecutionResult } from "@/features/editor-workspace/types";

function mapExecutionStatusToLegacyStatus(
  executionStatus: QueryExecutionStatus,
): ExecutionResult["status"] {
  return executionStatus === "ready"
    ? "success"
    : executionStatus === "failed" || executionStatus === "canceled"
      ? "error"
      : executionStatus === "idle"
        ? "idle"
        : "running";
}

export function adaptExecutionResult(args: {
  externalExecutionResult: ExecutionResult;
  executionStatus: QueryExecutionStatus;
  runId: string | null;
  executionErrorMessage: string | null;
  resultsData: RunResultsResponse | null | undefined;
  resultsError: Error | null | undefined;
  currentPage: number;
}): ExecutionResult {
  const {
    externalExecutionResult,
    executionStatus,
    runId,
    executionErrorMessage,
    resultsData,
    resultsError,
    currentPage,
  } = args;

  return {
    ...externalExecutionResult,
    status: mapExecutionStatusToLegacyStatus(executionStatus),
    executionStatus,
    runId: runId ?? undefined,
    errorMessage:
      executionErrorMessage ??
      resultsError?.message ??
      externalExecutionResult.errorMessage,
    columns: resultsData?.columns ?? externalExecutionResult.columns,
    rows: (resultsData?.rows ?? externalExecutionResult.rows) as Record<
      string,
      string | number | boolean | null
    >[],
    totalRows: resultsData?.totalRows ?? externalExecutionResult.totalRows,
    currentPage: resultsData?.page ?? currentPage,
    pageSize: resultsData?.pageSize ?? externalExecutionResult.pageSize,
  };
}
