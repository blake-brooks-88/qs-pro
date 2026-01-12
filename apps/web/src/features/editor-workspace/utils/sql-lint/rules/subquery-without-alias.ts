import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

/**
 * Detects derived tables (subqueries in FROM) without alias.
 * SQL Server requires: SELECT * FROM (SELECT ...) AS alias
 */
const getSubqueryWithoutAliasDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  // Track when we're in FROM clause and parentheses
  let inFromClause = false;
  let parenDepth = 0;
  const subqueryStack: Array<{
    depth: number;
    isInFrom: boolean;
    closeParenPos: number;
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

    // Track parentheses
    if (char === "(") {
      parenDepth += 1;

      // Check if this starts a SELECT subquery in FROM clause
      if (inFromClause) {
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
            // This is a subquery in FROM - mark it
            subqueryStack.push({
              depth: parenDepth,
              isInFrom: true,
              closeParenPos: -1, // Will be set when we find the closing paren
            });
          }
        }
      }

      index += 1;
      continue;
    }

    if (char === ")") {
      // Check if this closes a subquery in FROM
      const currentSubquery = subqueryStack[subqueryStack.length - 1];
      if (
        currentSubquery &&
        currentSubquery.depth === parenDepth &&
        currentSubquery.isInFrom
      ) {
        // Mark the closing paren position
        currentSubquery.closeParenPos = index;

        // Now check if there's an alias after the closing paren
        let lookAhead = index + 1;
        while (lookAhead < sql.length && /\s/.test(sql[lookAhead])) {
          lookAhead += 1;
        }

        let hasAlias = false;

        // Check for AS keyword or direct identifier
        if (lookAhead < sql.length && isWordChar(sql[lookAhead])) {
          let wordEnd = lookAhead + 1;
          while (wordEnd < sql.length && isWordChar(sql[wordEnd])) {
            wordEnd += 1;
          }
          const word = sql.slice(lookAhead, wordEnd).toLowerCase();

          if (word === "as") {
            // AS keyword found, there should be an alias after
            lookAhead = wordEnd;
            while (lookAhead < sql.length && /\s/.test(sql[lookAhead])) {
              lookAhead += 1;
            }
            if (
              lookAhead < sql.length &&
              (isWordChar(sql[lookAhead]) || sql[lookAhead] === "[")
            ) {
              hasAlias = true;
            }
          } else if (
            // Direct identifier (not a SQL keyword that follows FROM)
            ![
              "where",
              "join",
              "inner",
              "left",
              "right",
              "full",
              "cross",
              "group",
              "having",
              "order",
              "union",
              "except",
              "intersect",
              "on",
            ].includes(word)
          ) {
            // This is likely an alias
            hasAlias = true;
          }
        } else if (lookAhead < sql.length && sql[lookAhead] === "[") {
          // Bracketed alias
          hasAlias = true;
        }

        // If no alias found, report error
        if (!hasAlias) {
          diagnostics.push(
            createDiagnostic(
              `Derived table (subquery in FROM) requires an alias. ${MC.SHORT} follows SQL Server rules: \`SELECT * FROM (SELECT ...) AS alias\`.`,
              "error",
              index,
              index + 1,
            ),
          );
        }

        subqueryStack.pop();
      }

      parenDepth -= 1;
      index += 1;
      continue;
    }

    // Check for keywords
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      // Track FROM clause
      if (word === "from") {
        inFromClause = true;
      } else if (
        inFromClause &&
        (word === "where" ||
          word === "group" ||
          word === "having" ||
          word === "order" ||
          word === "union" ||
          word === "except" ||
          word === "intersect")
      ) {
        inFromClause = false;
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return diagnostics;
};

/**
 * Rule to detect derived tables (subqueries in FROM) without alias.
 * SQL Server requires aliases for all derived tables.
 */
export const subqueryWithoutAliasRule: LintRule = {
  id: "subquery-without-alias",
  name: "Subquery Without Alias",
  check: (context: LintContext) => {
    return getSubqueryWithoutAliasDiagnostics(context.sql);
  },
};
