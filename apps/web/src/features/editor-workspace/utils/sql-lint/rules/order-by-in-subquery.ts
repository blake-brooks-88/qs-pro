import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

/**
 * Detects ORDER BY in subqueries without TOP or OFFSET.
 * SQL Server (and MCE) requires TOP or OFFSET when using ORDER BY in subqueries/derived tables.
 */
const getOrderByInSubqueryDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let parenDepth = 0;

  // Track subquery contexts with their properties
  const subqueryStack: Array<{
    depth: number;
    hasTop: boolean;
    hasOffset: boolean;
    orderByPositions: Array<{ start: number; end: number }>;
  }> = [];

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

    // Handle single quotes
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

    // Handle double quotes
    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    // Handle brackets
    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

    // Start line comment
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    // Start block comment
    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Start single quote
    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    // Start double quote
    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Start bracket
    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Track parentheses for subquery detection
    if (char === "(") {
      parenDepth += 1;
      // Check if this starts a SELECT subquery
      let lookAhead = index + 1;
      while (lookAhead < sql.length && /\s/.test(sql[lookAhead])) {
        lookAhead += 1;
      }
      // Check if next word is SELECT
      if (lookAhead < sql.length && isWordChar(sql[lookAhead])) {
        let wordEnd = lookAhead + 1;
        while (wordEnd < sql.length && isWordChar(sql[wordEnd])) {
          wordEnd += 1;
        }
        const word = sql.slice(lookAhead, wordEnd).toLowerCase();
        if (word === "select") {
          // This is a subquery - push context
          subqueryStack.push({
            depth: parenDepth,
            hasTop: false,
            hasOffset: false,
            orderByPositions: [],
          });
        }
      }
      index += 1;
      continue;
    }

    if (char === ")") {
      // Check if we're closing a subquery context
      const currentContext = subqueryStack[subqueryStack.length - 1];
      if (currentContext && currentContext.depth === parenDepth) {
        // This closes a subquery - check if it has ORDER BY without TOP/OFFSET
        if (
          currentContext.orderByPositions.length > 0 &&
          !currentContext.hasTop &&
          !currentContext.hasOffset
        ) {
          for (const pos of currentContext.orderByPositions) {
            diagnostics.push(
              createDiagnostic(
                `ORDER BY in subquery requires TOP or OFFSET. ${MC.SHORT} follows SQL Server rules: \`SELECT TOP 100 ... ORDER BY\` or \`SELECT ... ORDER BY ... OFFSET 0 ROWS\`.`,
                "error",
                pos.start,
                pos.end,
              ),
            );
          }
        }
        subqueryStack.pop();
      }
      parenDepth -= 1;
      index += 1;
      continue;
    }

    // Check for keywords when we see word characters
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      // Check if we're in a subquery context
      const currentContext = subqueryStack[subqueryStack.length - 1];
      if (currentContext && currentContext.depth === parenDepth) {
        if (word === "top") {
          currentContext.hasTop = true;
        } else if (word === "offset") {
          currentContext.hasOffset = true;
        } else if (word === "order") {
          // Check if followed by BY
          let lookAhead = end;
          while (lookAhead < sql.length && /\s/.test(sql[lookAhead])) {
            lookAhead += 1;
          }
          if (lookAhead + 1 < sql.length) {
            const nextWord = sql.slice(lookAhead, lookAhead + 2).toLowerCase();
            if (nextWord === "by") {
              // Found ORDER BY in subquery
              currentContext.orderByPositions.push({
                start,
                end: lookAhead + 2,
              });
            }
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
 * Rule to detect ORDER BY in subqueries without TOP or OFFSET.
 * SQL Server (and MCE) requires TOP or OFFSET when using ORDER BY in subqueries/derived tables.
 */
export const orderByInSubqueryRule: LintRule = {
  id: "order-by-in-subquery",
  name: "ORDER BY in Subquery",
  check: (context: LintContext) => {
    return getOrderByInSubqueryDiagnostics(context.sql);
  },
};
