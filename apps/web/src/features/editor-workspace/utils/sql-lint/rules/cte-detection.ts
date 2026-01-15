import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

const getCteDetectionDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

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

      if (word === "with") {
        const rest = sql.slice(end);
        // Improved regex to catch:
        // 1. WITH cte AS (...)
        // 2. WITH cte (col1, col2) AS (...)
        // 3. WITH cte1 AS (...), cte2 AS (...)
        if (/\s*\w+\s*(\([^)]*\))?\s*AS\s*\(/i.test(rest)) {
          diagnostics.push(
            createDiagnostic(
              `WITH (Common Table Expressions) is not supported in ${MC.SHORT}. Use a subquery instead. Example: \`SELECT * FROM (SELECT ... ) AS sub\` instead of \`WITH sub AS (SELECT ...) SELECT * FROM sub\`.`,
              "error",
              start,
              end,
            ),
          );
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
 * Rule to detect CTE usage (WITH...AS pattern).
 */
export const cteDetectionRule: LintRule = {
  id: "cte-detection",
  name: "CTE Detection",
  check: (context: LintContext) => {
    return getCteDetectionDiagnostics(context.sql);
  },
};
