import { formatDialect, transactsql } from "sql-formatter";

export const SQL_TAB_SIZE = 4;

const FORMATTER_CONFIG = {
  dialect: transactsql,
  keywordCase: "upper" as const,
  tabWidth: SQL_TAB_SIZE,
  useTabs: false,
  functionCase: "preserve" as const,
  dataTypeCase: "upper" as const,
  logicalOperatorNewline: "before" as const,
  denseOperators: false,
  expressionWidth: 50,
  newlineBeforeSemicolon: false,
};

export function formatSql(sql: string): string {
  return formatDialect(sql, FORMATTER_CONFIG);
}
