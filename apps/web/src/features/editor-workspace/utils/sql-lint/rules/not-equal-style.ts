import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";

const getNotEqualStyleDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          index += 2;
          continue;
        }
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Check for <> operator
    if (char === "<" && nextChar === ">") {
      diagnostics.push(
        createDiagnostic(
          "Consider using != instead of <> for not-equal comparisons. While both are valid, != is more commonly used in modern SQL.",
          "warning",
          index,
          index + 2,
        ),
      );
      index += 2;
      continue;
    }

    index += 1;
  }

  return diagnostics;
};

/**
 * Rule to warn about <> usage instead of !=.
 * Style preference - != is more common in modern SQL.
 */
export const notEqualStyleRule: LintRule = {
  id: "not-equal-style",
  name: "Not-Equal Style Warning",
  check: (context: LintContext) => {
    return getNotEqualStyleDiagnostics(context.sql);
  },
};
