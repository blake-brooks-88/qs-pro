import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

const AGGREGATE_FUNCTIONS = new Set(["count", "sum", "avg", "min", "max"]);

/**
 * Detects aggregate functions (COUNT, SUM, AVG, MIN, MAX) in WHERE clause.
 * These should use HAVING instead.
 * Be careful not to flag aggregates inside subqueries in WHERE.
 */
const getAggregateInWhereDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  // Find WHERE clauses (not in subqueries)
  const whereClauses: Array<{ start: number; end: number }> = [];
  let parenDepth = 0;
  let inWhereClause = false;
  let whereStart = 0;

  // First pass: find WHERE clause boundaries at the top level
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

    // Track parentheses depth
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

    // Check for keywords at top level (parenDepth === 0)
    if (parenDepth === 0 && isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      if (word === "where" && !inWhereClause) {
        inWhereClause = true;
        whereStart = end; // Start after WHERE keyword
      } else if (
        inWhereClause &&
        (word === "group" ||
          word === "having" ||
          word === "order" ||
          word === "union" ||
          word === "except" ||
          word === "intersect")
      ) {
        // End of WHERE clause
        whereClauses.push({ start: whereStart, end: start });
        inWhereClause = false;
      }

      index = end;
      continue;
    }

    index += 1;
  }

  // If WHERE clause extends to end of query
  if (inWhereClause) {
    whereClauses.push({ start: whereStart, end: sql.length });
  }

  // Second pass: scan WHERE clauses for aggregate functions (not in subqueries)
  for (const whereClause of whereClauses) {
    let clauseIndex = whereClause.start;
    let clauseParenDepth = 0;
    inSingleQuote = false;
    inDoubleQuote = false;
    inBracket = false;
    inLineComment = false;
    inBlockComment = false;

    while (clauseIndex < whereClause.end) {
      const char = sql[clauseIndex];
      const nextChar = sql[clauseIndex + 1];

      // Handle line comments
      if (inLineComment) {
        if (char === "\n") {
          inLineComment = false;
        }
        clauseIndex += 1;
        continue;
      }

      // Handle block comments
      if (inBlockComment) {
        if (char === "*" && nextChar === "/") {
          inBlockComment = false;
          clauseIndex += 2;
          continue;
        }
        clauseIndex += 1;
        continue;
      }

      // Handle single quotes
      if (inSingleQuote) {
        if (char === "'") {
          if (nextChar === "'") {
            clauseIndex += 2;
            continue;
          }
          inSingleQuote = false;
        }
        clauseIndex += 1;
        continue;
      }

      // Handle double quotes
      if (inDoubleQuote) {
        if (char === '"') {
          inDoubleQuote = false;
        }
        clauseIndex += 1;
        continue;
      }

      // Handle brackets
      if (inBracket) {
        if (char === "]") {
          inBracket = false;
        }
        clauseIndex += 1;
        continue;
      }

      // Start line comment
      if (char === "-" && nextChar === "-") {
        inLineComment = true;
        clauseIndex += 2;
        continue;
      }

      // Start block comment
      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        clauseIndex += 2;
        continue;
      }

      // Start single quote
      if (char === "'") {
        inSingleQuote = true;
        clauseIndex += 1;
        continue;
      }

      // Start double quote
      if (char === '"') {
        inDoubleQuote = true;
        clauseIndex += 1;
        continue;
      }

      // Start bracket
      if (char === "[") {
        inBracket = true;
        clauseIndex += 1;
        continue;
      }

      // Track parentheses depth for subquery detection
      if (char === "(") {
        clauseParenDepth += 1;
        clauseIndex += 1;
        continue;
      }

      if (char === ")") {
        clauseParenDepth -= 1;
        clauseIndex += 1;
        continue;
      }

      // Check for aggregate functions at top level of WHERE clause (not in subquery)
      if (clauseParenDepth === 0 && isWordChar(char)) {
        const start = clauseIndex;
        let end = clauseIndex + 1;
        while (end < sql.length && isWordChar(sql[end])) {
          end += 1;
        }
        const word = sql.slice(start, end).toLowerCase();

        // Check if this is an aggregate function
        if (AGGREGATE_FUNCTIONS.has(word)) {
          // Check if followed by opening parenthesis (it's a function call)
          let lookAhead = end;
          while (lookAhead < sql.length && /\s/.test(sql[lookAhead])) {
            lookAhead += 1;
          }
          if (lookAhead < sql.length && sql[lookAhead] === "(") {
            // This is an aggregate function call in WHERE clause
            diagnostics.push(
              createDiagnostic(
                `Aggregate function ${word.toUpperCase()}() cannot be used in WHERE clause. Use HAVING instead. Example: \`SELECT ... GROUP BY ... HAVING ${word.toUpperCase()}(...) > 0\`.`,
                "error",
                start,
                end,
              ),
            );
          }
        }

        clauseIndex = end;
        continue;
      }

      clauseIndex += 1;
    }
  }

  return diagnostics;
};

/**
 * Rule to detect aggregate functions (COUNT, SUM, AVG, MIN, MAX) in WHERE clause.
 * These should use HAVING instead.
 */
export const aggregateInWhereRule: LintRule = {
  id: "aggregate-in-where",
  name: "Aggregate in WHERE Clause",
  check: (context: LintContext) => {
    return getAggregateInWhereDiagnostics(context.sql);
  },
};
