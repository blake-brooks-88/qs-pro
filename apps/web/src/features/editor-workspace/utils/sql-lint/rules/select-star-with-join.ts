import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

/**
 * Checks if SQL contains a JOIN clause.
 */
const hasJoinClause = (sql: string): boolean => {
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

    // Check for word tokens
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      if (word === "join") {
        return true;
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return false;
};

/**
 * Finds SELECT * occurrences (not table.* which is valid).
 */
const findUnqualifiedSelectStar = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;
  let inSelectClause = false;
  let selectStart = -1;

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

    // Check for word tokens
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      // Track SELECT keyword
      if (word === "select") {
        inSelectClause = true;
        selectStart = end;
        index = end;
        continue;
      }

      // FROM marks end of SELECT clause
      if (word === "from" && inSelectClause) {
        inSelectClause = false;
      }

      index = end;
      continue;
    }

    // Check for * in SELECT clause
    if (char === "*" && inSelectClause) {
      // Check if this is table.* (qualified) or just * (unqualified)
      // Look back to see if there's a dot before the star
      let lookBack = index - 1;
      while (lookBack >= selectStart && /\s/.test(sql[lookBack])) {
        lookBack--;
      }

      const isQualified = lookBack >= selectStart && sql[lookBack] === ".";

      if (!isQualified) {
        diagnostics.push(
          createDiagnostic(
            `SELECT * with JOINs causes ambiguous column errors in ${MC.SHORT}. Specify columns explicitly or use table aliases: \`SELECT a.*, b.SpecificColumn FROM ...\`.`,
            "error",
            index,
            index + 1,
          ),
        );
      }
    }

    index += 1;
  }

  return diagnostics;
};

/**
 * Detects SELECT * when query has JOINs.
 */
const getSelectStarWithJoinDiagnostics = (sql: string): SqlDiagnostic[] => {
  // First check if there are any JOINs
  if (!hasJoinClause(sql)) {
    return [];
  }

  // If there are JOINs, find unqualified SELECT *
  return findUnqualifiedSelectStar(sql);
};

/**
 * Rule to detect SELECT * when query contains JOINs.
 * MCE SQL requires explicit column specification or qualified wildcards (table.*)
 * when using JOINs to avoid ambiguous column references.
 */
export const selectStarWithJoinRule: LintRule = {
  id: "select-star-with-join",
  name: "SELECT * with JOIN",
  check: (context: LintContext) => {
    return getSelectStarWithJoinDiagnostics(context.sql);
  },
};
