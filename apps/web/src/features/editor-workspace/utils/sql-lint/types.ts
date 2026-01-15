import type { DataExtension } from "@/features/editor-workspace/types";
import type { SqlToken } from "../sql-context";

export type SqlDiagnosticSeverity = "error" | "warning" | "prereq";

/**
 * Severities that block query execution.
 * - "error": Syntax or semantic error that will cause the query to fail
 * - "prereq": Query is incomplete (missing SELECT, FROM, etc.)
 *
 * "warning" is advisory only and NEVER blocks execution.
 */
export const BLOCKING_SEVERITIES: ReadonlySet<SqlDiagnosticSeverity> = new Set([
  "error",
  "prereq",
]);

export interface SqlDiagnostic {
  message: string;
  severity: SqlDiagnosticSeverity;
  startIndex: number;
  endIndex: number;
}

export interface LintContext {
  sql: string;
  tokens: SqlToken[];
  dataExtensions?: DataExtension[];
  cursorPosition?: number;
}

export interface LintRule {
  id: string;
  name: string;
  check: (context: LintContext) => SqlDiagnostic[];
}

/**
 * Check if a diagnostic blocks query execution.
 * Only "error" and "prereq" severities block execution.
 * "warning" is advisory only and never blocks.
 */
export function isBlockingDiagnostic(diagnostic: SqlDiagnostic): boolean {
  return BLOCKING_SEVERITIES.has(diagnostic.severity);
}

/**
 * Get the first blocking diagnostic from a list, prioritizing by severity.
 * Priority: "error" first, then "prereq".
 * Returns null if no blocking diagnostics exist.
 */
export function getFirstBlockingDiagnostic(
  diagnostics: SqlDiagnostic[],
): SqlDiagnostic | null {
  // First look for errors (highest priority)
  const error = diagnostics.find((d) => d.severity === "error");
  if (error) return error;

  // Then look for prereq (missing structure)
  const prereq = diagnostics.find((d) => d.severity === "prereq");
  if (prereq) return prereq;

  // No blocking diagnostics
  return null;
}

/**
 * Check if any diagnostics in the list block execution.
 */
export function hasBlockingDiagnostics(diagnostics: SqlDiagnostic[]): boolean {
  return diagnostics.some(isBlockingDiagnostic);
}
