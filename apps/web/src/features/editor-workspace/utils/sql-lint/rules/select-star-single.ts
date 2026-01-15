import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

const getSelectStarSingleDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  // First pass: check if query contains JOIN
  const hasJoin = /\bjoin\b/i.test(sql);

  // Only check for SELECT * if no JOIN is present
  if (hasJoin) {
    return diagnostics;
  }

  while (index < sql.length) {
    const char = sql.charAt(index);
    const nextChar = sql.charAt(index + 1);

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

    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      if (word === "select") {
        // Skip whitespace after SELECT
        let pos = end;
        while (pos < sql.length && /\s/.test(sql.charAt(pos))) {
          pos += 1;
        }

        // Check if next character is * (not part of a block comment)
        if (pos < sql.length && sql.charAt(pos) === "*") {
          // Make sure it's not the start of a block comment
          const nextAfterStar = sql.charAt(pos + 1);
          if (nextAfterStar !== "/") {
            diagnostics.push(
              createDiagnostic(
                "Consider listing columns explicitly instead of using SELECT *. This improves query performance and prevents issues if the table structure changes.",
                "warning",
                pos,
                pos + 1,
              ),
            );
          }
        }
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return diagnostics;
};

/**
 * Rule to warn about SELECT * usage on single tables (no JOINs).
 * Best practice to list columns explicitly for better performance and maintainability.
 */
export const selectStarSingleRule: LintRule = {
  id: "select-star-single",
  name: "SELECT * Warning (Single Table)",
  check: (context: LintContext) => {
    return getSelectStarSingleDiagnostics(context.sql);
  },
};
