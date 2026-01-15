import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

/**
 * Checks if there's an ORDER BY clause before the given position in the SQL.
 * This function looks backwards through the SQL to find an ORDER BY within the same query scope.
 */
const hasOrderByBeforeOffset = (
  sql: string,
  offsetPosition: number,
): boolean => {
  let index = offsetPosition - 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let parenDepth = 0;

  while (index >= 0) {
    const char = sql.charAt(index);
    const prevChar = index > 0 ? sql.charAt(index - 1) : "";

    // Handle comments (backwards)
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index -= 1;
      continue;
    }

    if (inBlockComment) {
      if (char === "/" && prevChar === "*") {
        inBlockComment = false;
        index -= 2;
        continue;
      }
      index -= 1;
      continue;
    }

    // Handle strings (backwards)
    if (inSingleQuote) {
      if (char === "'") {
        inSingleQuote = false;
      }
      index -= 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index -= 1;
      continue;
    }

    // Handle brackets (backwards)
    if (inBracket) {
      if (char === "[") {
        inBracket = false;
      }
      index -= 1;
      continue;
    }

    // End of comment (backwards)
    if (char === "-" && prevChar === "-") {
      inLineComment = true;
      index -= 2;
      continue;
    }

    if (char === "/" && prevChar === "*") {
      inBlockComment = true;
      index -= 2;
      continue;
    }

    // End of string (backwards)
    if (char === "'") {
      inSingleQuote = true;
      index -= 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      index -= 1;
      continue;
    }

    // End of bracket (backwards)
    if (char === "]") {
      inBracket = true;
      index -= 1;
      continue;
    }

    // Track parentheses depth (backwards)
    if (char === ")") {
      parenDepth += 1;
      index -= 1;
      continue;
    }

    if (char === "(") {
      parenDepth -= 1;
      // If we've crossed into a subquery, stop searching
      if (parenDepth < 0) {
        return false;
      }
      index -= 1;
      continue;
    }

    // Only look for keywords at the same query level
    if (parenDepth === 0 && isWordChar(char)) {
      // Find the start of the word
      const wordEnd = index + 1;
      let wordStart = index;
      while (wordStart > 0 && isWordChar(sql.charAt(wordStart - 1))) {
        wordStart -= 1;
      }
      const word = sql.slice(wordStart, wordEnd).toLowerCase();

      // Check for ORDER BY
      if (word === "by") {
        // Look backwards for ORDER
        let checkIndex = wordStart - 1;
        while (checkIndex >= 0 && /\s/.test(sql.charAt(checkIndex))) {
          checkIndex -= 1;
        }
        if (checkIndex >= 4) {
          const prevWord = sql
            .slice(Math.max(0, checkIndex - 4), checkIndex + 1)
            .toLowerCase();
          if (prevWord.endsWith("order")) {
            return true; // Found ORDER BY at the same query level
          }
        }
      }

      // If we hit SELECT at the same level, stop searching
      if (word === "select") {
        return false;
      }

      index = wordStart - 1;
      continue;
    }

    index -= 1;
  }

  return false;
};

const getOffsetWithoutOrderByDiagnostics = (sql: string): SqlDiagnostic[] => {
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

      if (word === "offset") {
        // Check if there's an ORDER BY before this OFFSET
        if (!hasOrderByBeforeOffset(sql, start)) {
          diagnostics.push(
            createDiagnostic(
              `OFFSET requires an ORDER BY clause in ${MC.SHORT}. Add ORDER BY before using OFFSET.`,
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
 * Rule to detect OFFSET usage without ORDER BY.
 * OFFSET/FETCH is supported in MCE, but ONLY when used with ORDER BY.
 */
export const offsetWithoutOrderByRule: LintRule = {
  id: "offset-without-order-by",
  name: "OFFSET Without ORDER BY",
  check: (context: LintContext) => {
    return getOffsetWithoutOrderByDiagnostics(context.sql);
  },
};
