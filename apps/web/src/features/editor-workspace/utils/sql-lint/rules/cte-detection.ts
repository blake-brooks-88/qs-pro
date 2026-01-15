import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

const skipWhitespace = (sql: string, index: number): number => {
  let i = index;
  while (i < sql.length && /\s/.test(sql.charAt(i))) {
    i += 1;
  }
  return i;
};

const consumeWord = (
  sql: string,
  index: number,
): { value: string; end: number } | null => {
  if (index >= sql.length) return null;
  if (!isWordChar(sql.charAt(index))) return null;
  const start = index;
  let end = index + 1;
  while (end < sql.length && isWordChar(sql.charAt(end))) {
    end += 1;
  }
  return { value: sql.slice(start, end), end };
};

const consumeBracketIdentifier = (
  sql: string,
  index: number,
): { end: number } | null => {
  if (sql.charAt(index) !== "[") return null;
  let i = index + 1;
  while (i < sql.length) {
    const char = sql.charAt(i);
    const nextChar = sql.charAt(i + 1);
    if (char === "]") {
      if (nextChar === "]") {
        i += 2;
        continue;
      }
      return { end: i + 1 };
    }
    i += 1;
  }
  return null;
};

const consumeIdentifier = (
  sql: string,
  index: number,
): { end: number } | null => {
  if (sql.charAt(index) === "[") return consumeBracketIdentifier(sql, index);
  const word = consumeWord(sql, index);
  if (!word) return null;
  return { end: word.end };
};

const consumeColumnList = (
  sql: string,
  index: number,
): { end: number } | null => {
  if (sql.charAt(index) !== "(") return null;
  let i = index + 1;
  let inBracket = false;
  let inDoubleQuote = false;

  while (i < sql.length) {
    const char = sql.charAt(i);
    const nextChar = sql.charAt(i + 1);

    if (inBracket) {
      if (char === "]") {
        if (nextChar === "]") {
          i += 2;
          continue;
        }
        inBracket = false;
      }
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      i += 1;
      continue;
    }

    if (char === "[") {
      inBracket = true;
      i += 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      i += 1;
      continue;
    }

    if (char === ")") {
      return { end: i + 1 };
    }

    i += 1;
  }

  return null;
};

const consumeKeyword = (
  sql: string,
  index: number,
  keywordLower: string,
): { end: number } | null => {
  const slice = sql.slice(index, index + keywordLower.length);
  if (slice.toLowerCase() !== keywordLower) return null;
  const nextChar = sql.charAt(index + keywordLower.length);
  if (nextChar && isWordChar(nextChar)) return null;
  return { end: index + keywordLower.length };
};

const looksLikeCte = (sql: string, withKeywordEnd: number): boolean => {
  let i = skipWhitespace(sql, withKeywordEnd);

  const cteName = consumeIdentifier(sql, i);
  if (!cteName) return false;
  i = skipWhitespace(sql, cteName.end);

  const columnList = consumeColumnList(sql, i);
  if (columnList) {
    i = skipWhitespace(sql, columnList.end);
  }

  const asKeyword = consumeKeyword(sql, i, "as");
  if (!asKeyword) return false;
  i = skipWhitespace(sql, asKeyword.end);

  return sql.charAt(i) === "(";
};

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
        if (looksLikeCte(sql, end)) {
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
