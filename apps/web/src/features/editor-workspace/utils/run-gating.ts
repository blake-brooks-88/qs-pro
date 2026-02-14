import type { UsageResponse } from "@qpp/shared-types";

import { formatDiagnosticMessage } from "@/features/editor-workspace/utils/sql-diagnostics";
import type { SqlDiagnostic } from "@/features/editor-workspace/utils/sql-lint";

export function getRunLimitFlags(
  usage: UsageResponse | undefined,
  warningThreshold: number,
): { isAtRunLimit: boolean; isNearRunLimit: boolean } {
  const limit = usage?.queryRuns.limit;
  if (!limit) {
    return { isAtRunLimit: false, isNearRunLimit: false };
  }

  const current = usage.queryRuns.current;
  return {
    isAtRunLimit: current >= limit,
    isNearRunLimit: current >= limit * warningThreshold,
  };
}

export function getRunBlockMessage(
  blockingDiagnostic: SqlDiagnostic | null,
  sql: string,
): string | null {
  if (!blockingDiagnostic) {
    return null;
  }
  return formatDiagnosticMessage(blockingDiagnostic, sql);
}

export function getRunTooltipMessage(args: {
  isRunning: boolean;
  isAtRunLimit: boolean;
  hasBlockingDiagnostics: boolean;
  runBlockMessage: string | null;
}): string {
  const { isRunning, isAtRunLimit, hasBlockingDiagnostics, runBlockMessage } =
    args;

  if (isRunning) {
    return "Query is currently running...";
  }
  if (isAtRunLimit) {
    return "Monthly run limit reached. Click to upgrade.";
  }
  if (hasBlockingDiagnostics) {
    return runBlockMessage ?? "Query is missing required SQL.";
  }
  return "Execute SQL (Ctrl+Enter)";
}
