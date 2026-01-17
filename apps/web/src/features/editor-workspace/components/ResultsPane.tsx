import {
  AltArrowLeft,
  AltArrowRight,
  CloseCircle,
  DoubleAltArrowLeft,
  DoubleAltArrowRight,
  InfoCircle,
  LinkCircle,
} from "@solar-icons/react";

import type {
  ExecutionResult,
  ExecutionStatus,
} from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";

const STATUS_MESSAGES: Record<ExecutionStatus, string> = {
  idle: "Run a query to see results.",
  queued: "Queued...",
  running: "Running...",
  creating_data_extension: "Creating temp Data Extension...",
  validating_query: "Validating query...",
  executing_query: "Executing query...",
  fetching_results: "Fetching results...",
  ready: "Query completed",
  failed: "Query failed",
  canceled: "Query canceled",
};

const IN_PROGRESS_STATUSES: ExecutionStatus[] = [
  "queued",
  "running",
  "creating_data_extension",
  "validating_query",
  "executing_query",
  "fetching_results",
];

function isInProgressStatus(status: ExecutionStatus): boolean {
  return IN_PROGRESS_STATUSES.includes(status);
}

function getStatusMessage(result: ExecutionResult): string {
  if (result.statusMessage) {
    return result.statusMessage;
  }

  if (result.executionStatus) {
    const baseMessage = STATUS_MESSAGES[result.executionStatus];

    if (result.executionStatus === "ready") {
      return `Query executed in ${result.runtime} - ${result.totalRows} records found`;
    }

    if (result.executionStatus === "failed" && result.errorMessage) {
      return `Query failed: ${result.errorMessage}`;
    }

    return baseMessage;
  }

  if (result.status === "success") {
    return `Query executed in ${result.runtime} - ${result.totalRows} records found`;
  }
  if (result.status === "error") {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Empty error message should show default
    return result.errorMessage || "Query failed to execute.";
  }
  if (result.status === "running") {
    return "Query running...";
  }

  return "Run a query to see results.";
}

interface ResultsPaneProps {
  result: ExecutionResult;
  onPageChange?: (page: number) => void;
  onViewInContactBuilder?: () => void;
  onCancel?: () => void;
}

export function ResultsPane({
  result,
  onPageChange,
  onViewInContactBuilder,
  onCancel,
}: ResultsPaneProps) {
  const totalPages =
    result.pageSize > 0
      ? Math.max(1, Math.ceil(result.totalRows / result.pageSize))
      : 1;
  const columns = result.columns.length > 0 ? result.columns : ["Results"];
  const hasRows = result.rows.length > 0;
  const startRow =
    result.totalRows > 0 ? (result.currentPage - 1) * result.pageSize + 1 : 0;
  const endRow =
    result.totalRows > 0
      ? Math.min(result.currentPage * result.pageSize, result.totalRows)
      : 0;

  const statusMessage = getStatusMessage(result);

  const showCancelButton =
    result.executionStatus && isInProgressStatus(result.executionStatus);
  const showSpinner =
    result.status === "running" ||
    (result.executionStatus && isInProgressStatus(result.executionStatus));

  return (
    <div
      className="flex flex-col h-full bg-background animate-fade-in"
      data-testid="results-pane"
    >
      {/* Results Header */}
      <div className="h-9 border-y border-border bg-card/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          {showSpinner ? (
            <span
              className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"
              data-testid="status-spinner"
            />
          ) : (
            <InfoCircle size={14} className="text-primary" />
          )}
          <span data-testid="status-message">{statusMessage}</span>
        </div>

        <div className="flex items-center gap-4">
          {showCancelButton && onCancel ? (
            <button
              onClick={onCancel}
              data-testid="cancel-button"
              className="flex items-center gap-1.5 text-[11px] font-bold text-error hover:text-error/80 transition-colors"
            >
              <CloseCircle size={14} />
              Cancel
            </button>
          ) : null}
          <button
            onClick={onViewInContactBuilder}
            disabled={!hasRows}
            className={cn(
              "flex items-center gap-1.5 text-[11px] font-bold text-primary transition-colors",
              hasRows
                ? "hover:text-primary-400"
                : "opacity-40 cursor-not-allowed",
            )}
          >
            <LinkCircle size={14} />
            View in Contact Builder
          </button>
        </div>
      </div>

      {/* Data Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur shadow-sm z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="p-2.5 border-r border-border font-bold text-muted-foreground bg-muted/50"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {result.rows.map((row, i) => (
              <tr
                // eslint-disable-next-line react/no-array-index-key -- Query result rows are view-only, never reordered/mutated, have no stable IDs
                key={i}
                className="hover:bg-primary/5 transition-colors group"
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className="p-2.5 border-r border-border/50 text-foreground/80 group-hover:text-foreground"
                  >
                    {/**
                     * ESLINT-DISABLE JUSTIFICATION:
                     * This eslint-disable is an exception to project standards, not a pattern to follow.
                     *
                     * Why this is safe: `col` is derived from iterating over the `columns` array
                     * (line 27), which contains only string values from `result.columns`. The `row`
                     * object is typed as `Record<string, unknown>` from ExecutionResult. The `col`
                     * key is guaranteed to exist because both the header cells and data cells iterate
                     * over the same `columns` array. User input cannot inject arbitrary keys.
                     *
                     * Why not refactor: Using Map.get() would require transforming row data on every
                     * render cycle. The current pattern is idiomatic for rendering tabular data where
                     * columns define the access keys. This is a standard React table rendering pattern.
                     */}
                    {/* eslint-disable-next-line security/detect-object-injection */}
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))}
            {result.rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="p-12 text-center text-muted-foreground"
                >
                  {result.status === "idle" &&
                  (!result.executionStatus || result.executionStatus === "idle")
                    ? "Run a query to see results."
                    : "No data returned for this query."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Intelligent Pagination */}
      <div className="h-10 border-t border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Showing {startRow} - {endRow}
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={result.currentPage === 1}
            onClick={() => onPageChange?.(1)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <DoubleAltArrowLeft size={16} />
          </button>
          <button
            disabled={result.currentPage === 1}
            onClick={() => onPageChange?.(result.currentPage - 1)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <AltArrowLeft size={16} />
          </button>

          <div className="flex items-center gap-1 px-2">
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange?.(pageNum)}
                  className={cn(
                    "w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-all",
                    result.currentPage === pageNum
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/40"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 5 && (
              <span className="text-muted-foreground text-[10px]">...</span>
            )}
          </div>

          <button
            disabled={result.currentPage === totalPages}
            onClick={() => onPageChange?.(result.currentPage + 1)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <AltArrowRight size={16} />
          </button>
          <button
            disabled={result.currentPage === totalPages}
            onClick={() => onPageChange?.(totalPages)}
            className="p-1.5 text-muted-foreground hover:text-primary disabled:opacity-30 transition-colors"
          >
            <DoubleAltArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
