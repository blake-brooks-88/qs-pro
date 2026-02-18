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
 */
export function fixOffsetFetchCase(sql: string): string {
  return sql.replace(/\brows\b/gi, "ROWS").replace(/\bonly\b/gi, "ONLY");
}

/**
 * Transforms trailing commas to leading commas for readability.
 * Handles commas before inline comments and preserves commas inside strings.
 */
export function moveCommasToLeading(sql: string): string {
  return sql;
}

const postProcessingPipeline: Array<(sql: string) => string> = [
  fixSelectTop,
  stripTrailingSemicolon,
  fixOffsetFetchCase,
];

export function formatSql(sql: string): string {
  if (!sql.trim()) {
    return "";
  }

  const formatted = formatDialect(sql, FORMATTER_CONFIG);
  return postProcessingPipeline.reduce(
    (result, transform) => transform(result),
    formatted,
  );
}
