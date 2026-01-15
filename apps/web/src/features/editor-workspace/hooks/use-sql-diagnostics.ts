/**
 * Hook for SQL Diagnostics
 *
 * This hook manages the combination of synchronous and asynchronous SQL linting.
 *
 * Architecture:
 * - Synchronous rules run immediately for instant feedback (prereqs, simple token checks)
 * - Asynchronous rules run in a web worker for heavier AST analysis (syntax errors, policy)
 *
 * The merged diagnostics prioritize blocking issues and deduplicate overlapping errors.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-lint/types";
import { lintSql } from "@/features/editor-workspace/utils/sql-lint";
import type { DataExtension } from "@/features/editor-workspace/types";
import type {
  WorkerRequest,
  WorkerResponse,
} from "@/features/editor-workspace/utils/sql-lint/parser/protocol";
import { createRequestId } from "@/features/editor-workspace/utils/sql-lint/parser/protocol";

/** Configuration options for the hook */
export interface UseSqlDiagnosticsOptions {
  /** SQL content to lint */
  sql: string;
  /** Data extensions for context-aware linting */
  dataExtensions?: DataExtension[];
  /** Cursor position for context-aware suggestions */
  cursorPosition?: number;
  /** Debounce delay for async linting (ms) */
  debounceMs?: number;
  /** Enable AST-based async linting */
  enableAsyncLinting?: boolean;
}

/** Result of the hook */
export interface UseSqlDiagnosticsResult {
  /** All merged diagnostics */
  diagnostics: SqlDiagnostic[];
  /** Only synchronous diagnostics (for blocking checks) */
  syncDiagnostics: SqlDiagnostic[];
  /** Only async diagnostics (from worker) */
  asyncDiagnostics: SqlDiagnostic[];
  /** Whether async lint is in progress */
  isAsyncLinting: boolean;
  /** Last lint duration (ms) */
  lastLintDuration: number | null;
}

/** Default debounce delay */
const DEFAULT_DEBOUNCE_MS = 150;

/**
 * Hook for managing SQL diagnostics with sync + async linting
 */
export function useSqlDiagnostics({
  sql,
  dataExtensions,
  cursorPosition,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  enableAsyncLinting = true,
}: UseSqlDiagnosticsOptions): UseSqlDiagnosticsResult {
  // Worker ref - created lazily
  const workerRef = useRef<Worker | null>(null);
  const workerReadyRef = useRef(false);

  // Current request tracking for deduplication
  const currentRequestRef = useRef<string | null>(null);

  // State for async results
  const [asyncDiagnostics, setAsyncDiagnostics] = useState<SqlDiagnostic[]>([]);
  const [isAsyncLinting, setIsAsyncLinting] = useState(false);
  const [lastLintDuration, setLastLintDuration] = useState<number | null>(null);

  // Synchronous diagnostics (computed immediately)
  const syncDiagnostics = useMemo(
    () => lintSql(sql, { dataExtensions, cursorPosition }),
    [sql, dataExtensions, cursorPosition],
  );

  // Initialize worker lazily
  const getWorker = useCallback((): Worker | null => {
    if (!enableAsyncLinting) return null;

    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL(
            "@/features/editor-workspace/utils/sql-lint/parser/sql-lint.worker.ts",
            import.meta.url,
          ),
          { type: "module" },
        );

        workerRef.current.onmessage = (event: MessageEvent<WorkerResponse>) => {
          handleWorkerMessage(event.data);
        };

        workerRef.current.onerror = (error) => {
          // eslint-disable-next-line no-console
          console.error("[sql-lint.worker] Error:", error);
          setIsAsyncLinting(false);
        };

        // Initialize worker
        const initRequest: WorkerRequest = { type: "init" };
        workerRef.current.postMessage(initRequest);
      } catch {
        // Worker creation failed - fall back to sync-only
        return null;
      }
    }

    return workerRef.current;
  }, [enableAsyncLinting]);

  // Handle worker messages
  const handleWorkerMessage = useCallback((response: WorkerResponse) => {
    switch (response.type) {
      case "ready":
        workerReadyRef.current = true;
        break;

      case "lint-result":
        // Only apply if this is the current request (ignore stale results)
        if (response.requestId === currentRequestRef.current) {
          setAsyncDiagnostics(response.diagnostics);
          setLastLintDuration(response.duration);
          setIsAsyncLinting(false);
        }
        break;

      case "error":
        // eslint-disable-next-line no-console
        console.error("[sql-lint.worker] Lint error:", response.message);
        if (response.requestId === currentRequestRef.current) {
          setIsAsyncLinting(false);
        }
        break;
    }
  }, []);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  // Debounced async lint effect
  useEffect(() => {
    if (!enableAsyncLinting) return;

    // Skip async lint for empty SQL
    if (!sql.trim()) {
      setAsyncDiagnostics([]);
      setIsAsyncLinting(false);
      return;
    }

    // Set linting state immediately
    setIsAsyncLinting(true);

    const timeoutId = setTimeout(() => {
      const worker = getWorker();
      if (!worker) {
        setIsAsyncLinting(false);
        return;
      }

      // Create new request
      const requestId = createRequestId();
      currentRequestRef.current = requestId;

      const request: WorkerRequest = {
        type: "lint",
        requestId,
        sql,
      };

      worker.postMessage(request);
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [sql, debounceMs, enableAsyncLinting, getWorker]);

  // Merge diagnostics, deduplicating overlapping errors
  const diagnostics = useMemo(() => {
    return mergeDiagnostics(syncDiagnostics, asyncDiagnostics);
  }, [syncDiagnostics, asyncDiagnostics]);

  return {
    diagnostics,
    syncDiagnostics,
    asyncDiagnostics,
    isAsyncLinting,
    lastLintDuration,
  };
}

/**
 * Merge sync and async diagnostics, removing duplicates.
 *
 * Deduplication strategy:
 * - Exact message match at same location: keep one
 * - Overlapping location with similar severity: prefer the more specific one
 */
function mergeDiagnostics(
  sync: SqlDiagnostic[],
  async: SqlDiagnostic[],
): SqlDiagnostic[] {
  const result: SqlDiagnostic[] = [];
  const seen = new Set<string>();

  // Helper to create a key for deduplication
  const createKey = (d: SqlDiagnostic) =>
    `${d.severity}:${d.startIndex}:${d.endIndex}:${d.message}`;

  // Add sync diagnostics first (they have priority for blocking)
  for (const d of sync) {
    const key = createKey(d);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(d);
    }
  }

  // Add async diagnostics if not duplicates
  for (const d of async) {
    const key = createKey(d);
    if (!seen.has(key)) {
      // Also check for overlapping locations with same severity
      const hasOverlap = result.some(
        (existing) =>
          existing.severity === d.severity &&
          rangesOverlap(
            existing.startIndex,
            existing.endIndex,
            d.startIndex,
            d.endIndex,
          ) &&
          messagesSimilar(existing.message, d.message),
      );

      if (!hasOverlap) {
        seen.add(key);
        result.push(d);
      }
    }
  }

  // Sort by position, then severity
  return result.sort((a, b) => {
    if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
    // "error" first, then "prereq", then "warning"
    const severityOrder = { error: 0, prereq: 1, warning: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

/**
 * Check if two ranges overlap
 */
function rangesOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number,
): boolean {
  return start1 < end2 && start2 < end1;
}

/**
 * Check if two messages are similar (for deduplication)
 */
function messagesSimilar(msg1: string, msg2: string): boolean {
  // Exact match
  if (msg1 === msg2) return true;

  // Normalize and compare
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalize(msg1) === normalize(msg2);
}
