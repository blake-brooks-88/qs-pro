/**
 * useSqlDiagnostics Hook
 *
 * This hook provides merged SQL diagnostics from two sources:
 * 1. Synchronous legacy/prereq rules (immediate feedback)
 * 2. Asynchronous AST-based parsing in Web Worker (debounced 200ms)
 *
 * Key features:
 * - Immediate feedback from prereq rules while typing
 * - AST parsing off the main thread for responsiveness
 * - Deduplication of diagnostics from both sources
 * - Stale response handling via requestId
 * - Suppression of worker parse errors when prereq diagnostics exist
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DataExtension } from "@/features/editor-workspace/types";
import type { SqlDiagnostic } from "./types";
import { lintSql } from "./index";
import type { WorkerRequest, WorkerResponse } from "./parser/protocol";
import { createRequestId } from "./parser/protocol";

/**
 * Debounce delay for worker requests (ms)
 */
const DEBOUNCE_MS = 200;

/**
 * Maximum SQL length to send to worker.
 * Beyond this, we skip AST parsing to avoid performance issues.
 */
const MAX_SQL_LENGTH = 50000;

interface UseSqlDiagnosticsOptions {
  dataExtensions?: DataExtension[];
  cursorPosition?: number;
}

/**
 * Severity priority for sorting (lower is higher priority)
 */
const SEVERITY_PRIORITY: Record<string, number> = {
  error: 0,
  warning: 1,
  prereq: 2,
};

/**
 * Create a stable dedupe key for a diagnostic
 */
function createDedupeKey(diagnostic: SqlDiagnostic): string {
  return `${diagnostic.severity}:${diagnostic.startIndex}:${diagnostic.endIndex}:${diagnostic.message}`;
}

/**
 * Deduplicate and sort diagnostics
 */
function dedupeAndSortDiagnostics(
  diagnostics: SqlDiagnostic[],
): SqlDiagnostic[] {
  // Dedupe by key
  const seen = new Set<string>();
  const deduped: SqlDiagnostic[] = [];

  for (const diag of diagnostics) {
    const key = createDedupeKey(diag);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(diag);
    }
  }

  // Sort: startIndex asc, severity priority, endIndex desc
  return deduped.sort((a, b) => {
    // 1. startIndex ascending
    if (a.startIndex !== b.startIndex) {
      return a.startIndex - b.startIndex;
    }

    // 2. severity priority (error > warning > prereq)
    const aPriority = SEVERITY_PRIORITY[a.severity] ?? 3;
    const bPriority = SEVERITY_PRIORITY[b.severity] ?? 3;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    // 3. endIndex descending (longer spans first)
    return b.endIndex - a.endIndex;
  });
}

/**
 * Check if arrays of diagnostics are equal (shallow comparison)
 */
function diagnosticsEqual(a: SqlDiagnostic[], b: SqlDiagnostic[]): boolean {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i++) {
    if (createDedupeKey(a[i]) !== createDedupeKey(b[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Hook to get SQL diagnostics from both legacy and AST-based linting.
 *
 * Usage:
 * ```tsx
 * const diagnostics = useSqlDiagnostics(sql, { dataExtensions, cursorPosition });
 * ```
 */
export function useSqlDiagnostics(
  sql: string,
  options: UseSqlDiagnosticsOptions = {},
): SqlDiagnostic[] {
  const { dataExtensions, cursorPosition } = options;

  // State for merged diagnostics
  const [mergedDiagnostics, setMergedDiagnostics] = useState<SqlDiagnostic[]>(
    [],
  );

  // Refs for worker management
  const workerRef = useRef<Worker | null>(null);
  const latestRequestIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const workerDiagnosticsRef = useRef<SqlDiagnostic[]>([]);

  // Run legacy linting synchronously - this is immediate feedback
  const syncDiagnostics = useMemo(
    () => lintSql(sql, { dataExtensions, cursorPosition }),
    [sql, dataExtensions, cursorPosition],
  );

  // Check if we have prereq diagnostics (used to suppress worker parse errors)
  const hasPrereqDiagnostics = useMemo(
    () => syncDiagnostics.some((d) => d.severity === "prereq"),
    [syncDiagnostics],
  );

  // Initialize worker
  useEffect(() => {
    // Create worker lazily on first mount
    const worker = new Worker(
      new URL("./parser/sql-lint.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;

      switch (response.type) {
        case "ready":
          // Worker is initialized
          break;

        case "lint-result":
          // Only apply result if it matches the latest request
          if (response.requestId === latestRequestIdRef.current) {
            workerDiagnosticsRef.current = response.diagnostics;
            // Trigger re-merge (will be handled in effect below)
            setMergedDiagnostics((prev) => {
              const merged = mergeDiagnostics(
                syncDiagnostics,
                response.diagnostics,
                hasPrereqDiagnostics,
              );
              // Only update if changed
              return diagnosticsEqual(prev, merged) ? prev : merged;
            });
          }
          break;

        case "error":
          // Worker error - log but don't crash
          // In production, this would be sent to error monitoring
          break;
      }
    };

    // Send init message to warm up the parser
    worker.postMessage({ type: "init" } satisfies WorkerRequest);

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Request worker lint with debouncing
  const requestWorkerLint = useCallback((sqlToLint: string) => {
    if (!workerRef.current) return;

    // Skip for empty or very large SQL
    if (!sqlToLint.trim() || sqlToLint.length > MAX_SQL_LENGTH) {
      workerDiagnosticsRef.current = [];
      return;
    }

    const requestId = createRequestId();
    latestRequestIdRef.current = requestId;

    workerRef.current.postMessage({
      type: "lint",
      requestId,
      sql: sqlToLint,
    } satisfies WorkerRequest);
  }, []);

  // Merge diagnostics from sync and worker sources
  const mergeDiagnostics = useCallback(
    (
      sync: SqlDiagnostic[],
      worker: SqlDiagnostic[],
      hasPrereq: boolean,
    ): SqlDiagnostic[] => {
      // If prereq diagnostics exist, suppress worker parse errors
      // This improves UX during typing - user sees "missing SELECT" not parse error
      let filteredWorker = worker;
      if (hasPrereq) {
        // Filter out generic parse errors when prereq exists
        filteredWorker = worker.filter((d) => {
          // Keep non-error diagnostics
          if (d.severity !== "error") return true;
          // Keep specific policy errors (MCE-related)
          if (d.message.includes("MCE")) return true;
          if (d.message.includes("not available")) return true;
          if (d.message.includes("not supported")) return true;
          if (d.message.includes("read-only")) return true;
          // Filter out generic parse errors
          return false;
        });
      }

      // Combine and dedupe
      const combined = [...sync, ...filteredWorker];
      return dedupeAndSortDiagnostics(combined);
    },
    [],
  );

  // Effect to debounce worker requests when SQL changes
  useEffect(() => {
    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce worker request
    debounceTimerRef.current = setTimeout(() => {
      requestWorkerLint(sql);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [sql, requestWorkerLint]);

  // Effect to merge diagnostics when sync diagnostics change
  useEffect(() => {
    const merged = mergeDiagnostics(
      syncDiagnostics,
      workerDiagnosticsRef.current,
      hasPrereqDiagnostics,
    );

    setMergedDiagnostics((prev) =>
      diagnosticsEqual(prev, merged) ? prev : merged,
    );
  }, [syncDiagnostics, hasPrereqDiagnostics, mergeDiagnostics]);

  return mergedDiagnostics;
}

export default useSqlDiagnostics;
