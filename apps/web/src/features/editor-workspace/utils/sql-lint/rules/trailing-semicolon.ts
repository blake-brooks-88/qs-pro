import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

const getTrailingSemicolonDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const trimmed = sql.trimEnd();

  if (trimmed.endsWith(";")) {
    const semicolonIndex = trimmed.length - 1;
    diagnostics.push(
      createDiagnostic(
        `Trailing semicolon detected. ${MC.SHORT} often errors on trailing semicolons. Remove the semicolon at the end of the query.`,
        "error",
        semicolonIndex,
        semicolonIndex + 1,
      ),
    );
  }

  return diagnostics;
};

/**
 * Rule to detect trailing semicolons in MCE SQL.
 * MCE often errors when queries end with semicolons.
 */
export const trailingSemicolonRule: LintRule = {
  id: "trailing-semicolon",
  name: "Trailing Semicolon",
  check: (context: LintContext) => {
    return getTrailingSemicolonDiagnostics(context.sql);
  },
};
