import type { LintContext, LintRule, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";

/**
 * Checks if a position in the SQL string is inside a string literal or comment.
 */
function isInsideStringOrComment(sql: string, position: number): boolean {
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < position; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inSingleQuote) {
      if (char === "'" && sql[i - 1] !== "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (char === "-" && nextChar === "-") {
      inLineComment = true;
    } else if (char === "/" && nextChar === "*") {
      inBlockComment = true;
    } else if (char === "'") {
      inSingleQuote = true;
    }
  }

  return inSingleQuote || inLineComment || inBlockComment;
}

/**
 * Detects multi-statement queries by finding semicolons followed by another statement.
 */
const getMultiStatementDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];

  // Find semicolons followed by another statement (SELECT or WITH)
  const pattern = /;\s*(SELECT|WITH)\b/gi;
  let match;

  while ((match = pattern.exec(sql)) !== null) {
    if (!isInsideStringOrComment(sql, match.index)) {
      diagnostics.push(
        createDiagnostic(
          "MCE Query Activities only support a single SQL statement. Remove additional statements.",
          "error",
          match.index,
          match.index + 1,
        ),
      );
    }
  }

  return diagnostics;
};

/**
 * Rule to detect multi-statement queries in MCE SQL.
 * MCE Query Activities only support a single SQL statement.
 */
export const noMultiStatementRule: LintRule = {
  id: "no-multi-statement",
  name: "No Multi-Statement Queries",
  check: (context: LintContext) => {
    return getMultiStatementDiagnostics(context.sql);
  },
};
