import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

const CLAUSE_KEYWORDS = new Set([
  "from",
  "where",
  "group",
  "order",
  "having",
  "join",
  "inner",
  "left",
  "right",
  "full",
  "cross",
  "outer",
  "on",
  "union",
  "intersect",
  "except",
]);

const getCommaValidationDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let parenDepth = 0;

  // Track clause boundaries
  let inSelectClause = false;
  let inGroupByClause = false;
  let inOrderByClause = false;
  let lastCommaIndex = -1;
  let clauseStartIndex = -1;

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

    // Track parenthesis depth
    if (char === "(") {
      parenDepth += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
      parenDepth -= 1;
      index += 1;
      continue;
    }

    // Only process commas at parenthesis depth 0 (not inside function calls or subqueries)
    if (char === "," && parenDepth === 0) {
      // Check for double comma (previous comma with only whitespace between)
      if (lastCommaIndex !== -1) {
        let hasOnlyWhitespace = true;
        for (let i = lastCommaIndex + 1; i < index; i++) {
          const c = sql.charAt(i);
          if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
            hasOnlyWhitespace = false;
            break;
          }
        }
        if (hasOnlyWhitespace) {
          diagnostics.push(
            createDiagnostic(
              "Double comma detected. Remove the extra comma.",
              "error",
              lastCommaIndex,
              index + 1,
            ),
          );
        }
      }

      // Check for leading comma in SELECT clause
      if (inSelectClause && lastCommaIndex === -1 && clauseStartIndex !== -1) {
        let hasOnlyWhitespace = true;
        for (let i = clauseStartIndex; i < index; i++) {
          const c = sql.charAt(i);
          if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
            hasOnlyWhitespace = false;
            break;
          }
        }
        if (hasOnlyWhitespace) {
          diagnostics.push(
            createDiagnostic(
              "Missing column before comma. Add a column or remove the comma.",
              "error",
              index,
              index + 1,
            ),
          );
        }
      }

      lastCommaIndex = index;
      index += 1;
      continue;
    }

    // Process keywords
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      // Check if there's a trailing comma before this keyword
      if (CLAUSE_KEYWORDS.has(word) && lastCommaIndex !== -1) {
        let hasOnlyWhitespace = true;
        for (let i = lastCommaIndex + 1; i < start; i++) {
          const c = sql.charAt(i);
          if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
            hasOnlyWhitespace = false;
            break;
          }
        }
        if (hasOnlyWhitespace && parenDepth === 0) {
          const keywordName = word.toUpperCase();
          diagnostics.push(
            createDiagnostic(
              `Trailing comma before ${keywordName}. Remove the comma after the last column.`,
              "error",
              lastCommaIndex,
              lastCommaIndex + 1,
            ),
          );
        }
      }

      // Track clause boundaries
      if (word === "select" && parenDepth === 0) {
        inSelectClause = true;
        inGroupByClause = false;
        inOrderByClause = false;
        lastCommaIndex = -1;
        clauseStartIndex = end;
      } else if (word === "from" && parenDepth === 0) {
        inSelectClause = false;
        lastCommaIndex = -1;
      } else if (word === "group" && parenDepth === 0) {
        const nextWordStart = end;
        let nextWordEnd = nextWordStart;
        while (nextWordEnd < sql.length && /\s/.test(sql.charAt(nextWordEnd))) {
          nextWordEnd += 1;
        }
        const nextWordStartActual = nextWordEnd;
        while (
          nextWordEnd < sql.length &&
          isWordChar(sql.charAt(nextWordEnd))
        ) {
          nextWordEnd += 1;
        }
        const nextWord = sql
          .slice(nextWordStartActual, nextWordEnd)
          .toLowerCase();
        if (nextWord === "by") {
          inSelectClause = false;
          inGroupByClause = true;
          inOrderByClause = false;
          lastCommaIndex = -1;
        }
      } else if (word === "order" && parenDepth === 0) {
        const nextWordStart = end;
        let nextWordEnd = nextWordStart;
        while (nextWordEnd < sql.length && /\s/.test(sql.charAt(nextWordEnd))) {
          nextWordEnd += 1;
        }
        const nextWordStartActual = nextWordEnd;
        while (
          nextWordEnd < sql.length &&
          isWordChar(sql.charAt(nextWordEnd))
        ) {
          nextWordEnd += 1;
        }
        const nextWord = sql
          .slice(nextWordStartActual, nextWordEnd)
          .toLowerCase();
        if (nextWord === "by") {
          inSelectClause = false;
          inGroupByClause = false;
          inOrderByClause = true;
          lastCommaIndex = -1;
        }
      } else if (
        word === "having" ||
        word === "union" ||
        word === "intersect" ||
        word === "except"
      ) {
        if (parenDepth === 0) {
          inSelectClause = false;
          inGroupByClause = false;
          inOrderByClause = false;
          lastCommaIndex = -1;
        }
      }

      index = end;
      continue;
    }

    index += 1;
  }

  // Check for trailing comma at end of GROUP BY or ORDER BY clause
  if (lastCommaIndex !== -1 && (inGroupByClause || inOrderByClause)) {
    let hasOnlyWhitespaceAfter = true;
    for (let i = lastCommaIndex + 1; i < sql.length; i++) {
      const c = sql.charAt(i);
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") {
        hasOnlyWhitespaceAfter = false;
        break;
      }
    }
    if (hasOnlyWhitespaceAfter) {
      const clauseName = inGroupByClause ? "GROUP BY" : "ORDER BY";
      diagnostics.push(
        createDiagnostic(
          `Trailing comma before ${clauseName}. Remove the comma after the last column.`,
          "error",
          lastCommaIndex,
          lastCommaIndex + 1,
        ),
      );
    }
  }

  return diagnostics;
};

/**
 * Rule to detect invalid comma usage in MCE SQL.
 * Detects trailing commas before keywords, leading commas in SELECT,
 * double commas, and trailing commas in GROUP BY/ORDER BY.
 */
export const commaValidationRule: LintRule = {
  id: "comma-validation",
  name: "Comma Validation",
  check: (context: LintContext) => {
    return getCommaValidationDiagnostics(context.sql);
  },
};
