import { formatDialect, transactsql } from "sql-formatter";

export const SQL_TAB_SIZE = 4;

const FORMATTER_CONFIG = {
  dialect: transactsql,
  keywordCase: "upper" as const,
  tabWidth: SQL_TAB_SIZE,
  useTabs: false,
  functionCase: "upper" as const,
  dataTypeCase: "upper" as const,
  logicalOperatorNewline: "before" as const,
  denseOperators: false,
  expressionWidth: 50,
  newlineBeforeSemicolon: false,
};

/**
 * Fixes sql-formatter misplacing TOP N as an indented column expression.
 * @see https://github.com/sql-formatter-org/sql-formatter/issues/894
 */
export function fixSelectTop(sql: string): string {
  return sql.replace(
    /(SELECT(?:\s+(?:ALL|DISTINCT))?)\n(\s+)TOP\s+(\(?\d+\)?(?:\s+PERCENT)?)\s*/gi,
    "$1 TOP $3\n$2",
  );
}

/**
 * Strips trailing semicolons from formatted SQL.
 * MCE Query Studio does not require semicolons and they can cause issues.
 */
export function stripTrailingSemicolon(sql: string): string {
  return sql.replace(/;\s*$/, "");
}

/**
 * Uppercases ROWS and ONLY keywords in OFFSET FETCH clauses.
 * These keywords are not handled by sql-formatter's keywordCase option.
 * Targets only the rigid OFFSET/FETCH syntax to avoid mutating string literals or comments.
 */
export function fixOffsetFetchCase(sql: string): string {
  return sql
    .replace(/(\bOFFSET\s+\d+\s+)rows\b/gi, "$1ROWS")
    .replace(
      /(\bFETCH\s+(?:NEXT|FIRST)\s+\d+\s+)rows(\s+)only\b/gi,
      "$1ROWS$2ONLY",
    );
}

/**
 * Transforms trailing commas to leading commas for readability.
 * Operates line-by-line to correctly handle:
 * - Standard trailing commas: `col1,\n    col2` → `col1\n    , col2`
 * - Commas before inline comments: `col1, -- desc\n    col2` → `col1 -- desc\n    , col2`
 * - Commas inside string literals (never trailing, left untouched)
 * - Block comments spanning multiple lines
 */
export function moveCommasToLeading(sql: string): string {
  const lines = sql.split("\n");
  const result: string[] = [];
  let pendingComma = false;
  let inBlockComment = false;

  for (const rawLine of lines) {
    let line = rawLine;

    if (pendingComma) {
      const indentMatch = line.match(/^(\s*)(.*)/s);
      if (indentMatch?.[2]) {
        line = `${indentMatch[1]}, ${indentMatch[2]}`;
      }
      pendingComma = false;
    }

    if (inBlockComment) {
      if (line.includes("*/")) {
        inBlockComment = false;
      } else {
        result.push(line);
        continue;
      }
    }

    const lastOpen = line.lastIndexOf("/*");
    const lastClose = line.lastIndexOf("*/");
    if (lastOpen > lastClose) {
      inBlockComment = true;
      result.push(line);
      continue;
    }

    const trimmedEnd = line.trimEnd();

    if (trimmedEnd.endsWith(",")) {
      const beforeComma = trimmedEnd.slice(0, -1);
      const quoteCount = (beforeComma.match(/'/g) ?? []).length;

      if (quoteCount % 2 === 0) {
        line = beforeComma;
        pendingComma = true;
      }
    } else {
      const inlineCommentMatch = trimmedEnd.match(/^(.*\S),\s+(--.*$)/);
      if (inlineCommentMatch?.[1] && inlineCommentMatch[2]) {
        const beforeComma = inlineCommentMatch[1];
        const quoteCount = (beforeComma.match(/'/g) ?? []).length;
        if (quoteCount % 2 === 0) {
          line = `${beforeComma} ${inlineCommentMatch[2]}`;
          pendingComma = true;
        }
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

const postProcessingPipeline: Array<(sql: string) => string> = [
  fixSelectTop,
  moveCommasToLeading,
  stripTrailingSemicolon,
  fixOffsetFetchCase,
];

export function formatSql(sql: string): string {
  if (!sql.trim()) {
    return "";
  }

  try {
    const formatted = formatDialect(sql, FORMATTER_CONFIG);
    return postProcessingPipeline.reduce(
      (result, transform) => transform(result),
      formatted,
    );
  } catch {
    return sql;
  }
}
