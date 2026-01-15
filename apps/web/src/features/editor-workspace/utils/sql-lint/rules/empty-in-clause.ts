import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

const getEmptyInClauseDiagnostics = (sql: string): SqlDiagnostic[] => {
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

    // Handle line comments
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index += 1;
      continue;
    }

    // Handle block comments
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    // Handle single-quoted strings
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

    // Handle double-quoted identifiers
    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    // Handle bracketed identifiers
    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

    // Start of line comment
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    // Start of block comment
    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Start of single-quoted string
    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    // Start of double-quoted identifier
    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Start of bracketed identifier
    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Check for IN keyword
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      if (word === "in") {
        // Look for opening parenthesis after IN
        let parenIndex = end;
        while (parenIndex < sql.length && /\s/.test(sql.charAt(parenIndex))) {
          parenIndex += 1;
        }

        if (parenIndex < sql.length && sql.charAt(parenIndex) === "(") {
          // Found opening paren, check if it's followed immediately by closing paren
          let closingIndex = parenIndex + 1;

          // Skip whitespace inside parentheses
          while (
            closingIndex < sql.length &&
            /\s/.test(sql.charAt(closingIndex))
          ) {
            closingIndex += 1;
          }

          if (closingIndex < sql.length && sql.charAt(closingIndex) === ")") {
            // Empty IN clause detected
            diagnostics.push(
              createDiagnostic(
                "Empty IN clause detected. Add values inside the parentheses or remove the IN clause.",
                "error",
                start,
                closingIndex + 1,
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
 * Rule to detect empty IN clauses in MCE SQL.
 * Detects patterns like WHERE x IN () with no values.
 */
export const emptyInClauseRule: LintRule = {
  id: "empty-in-clause",
  name: "Empty IN Clause",
  check: (context: LintContext) => {
    return getEmptyInClauseDiagnostics(context.sql);
  },
};
