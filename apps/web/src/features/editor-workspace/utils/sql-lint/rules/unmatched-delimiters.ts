import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";

const getUnmatchedDelimitersDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  let parenCount = 0;
  let bracketCount = 0;
  let lastOpenParen = -1;
  let lastOpenBracket = -1;
  let unclosedQuoteIndex = -1;

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

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
          // Escaped quote
          index += 2;
          continue;
        }
        // End of string
        inSingleQuote = false;
        unclosedQuoteIndex = -1;
      }
      index += 1;
      continue;
    }

    // Handle double-quoted identifiers (don't need to track for unmatched quotes)
    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
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
      unclosedQuoteIndex = index;
      index += 1;
      continue;
    }

    // Start of double-quoted identifier
    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Track parentheses
    if (char === "(") {
      if (parenCount === 0) {
        lastOpenParen = index;
      }
      parenCount += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
      parenCount -= 1;
      if (parenCount < 0) {
        diagnostics.push(
          createDiagnostic(
            "Unmatched closing parenthesis. Remove the extra ')' or add a matching '('.",
            "error",
            index,
            index + 1,
          ),
        );
        parenCount = 0; // Reset to continue checking
      }
      index += 1;
      continue;
    }

    // Track brackets
    if (char === "[") {
      if (bracketCount === 0) {
        lastOpenBracket = index;
      }
      bracketCount += 1;
      index += 1;
      continue;
    }

    if (char === "]") {
      bracketCount -= 1;
      if (bracketCount < 0) {
        diagnostics.push(
          createDiagnostic(
            "Unmatched closing bracket. Remove the extra ']' or add a matching '['.",
            "error",
            index,
            index + 1,
          ),
        );
        bracketCount = 0; // Reset to continue checking
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  // Check for unclosed delimiters at end of query
  if (parenCount > 0 && lastOpenParen !== -1) {
    diagnostics.push(
      createDiagnostic(
        "Unclosed parenthesis. Add a matching ')' or remove the extra '('.",
        "error",
        lastOpenParen,
        lastOpenParen + 1,
      ),
    );
  }

  if (bracketCount > 0 && lastOpenBracket !== -1) {
    diagnostics.push(
      createDiagnostic(
        "Unclosed bracket. Add a matching ']' or remove the extra '['.",
        "error",
        lastOpenBracket,
        lastOpenBracket + 1,
      ),
    );
  }

  if (inSingleQuote && unclosedQuoteIndex !== -1) {
    diagnostics.push(
      createDiagnostic(
        "Unclosed single quote. Add a closing ' or remove the opening quote.",
        "error",
        unclosedQuoteIndex,
        unclosedQuoteIndex + 1,
      ),
    );
  }

  return diagnostics;
};

/**
 * Rule to detect unmatched delimiters in MCE SQL.
 * Checks for unmatched parentheses, brackets, and quotes.
 */
export const unmatchedDelimitersRule: LintRule = {
  id: "unmatched-delimiters",
  name: "Unmatched Delimiters",
  check: (context: LintContext) => {
    return getUnmatchedDelimitersDiagnostics(context.sql);
  },
};
