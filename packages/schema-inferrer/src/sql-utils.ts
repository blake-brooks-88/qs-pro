import { Parser } from "node-sql-parser";

const parser = new Parser();
const DIALECT = "transactsql";

interface FromTable {
  table?: string;
  as?: string;
  db?: string;
  expr?: unknown;
  join?: string;
  on?: unknown;
}

interface AstStatement {
  type?: string;
  columns?: unknown[];
  from?: FromTable | FromTable[] | null;
}

/**
 * Remove square brackets from identifier names.
 * "[TableName]" -> "TableName"
 * "TableName" -> "TableName" (unchanged)
 */
export function stripBrackets(name: string): string {
  if (name.startsWith("[") && name.endsWith("]")) {
    return name.slice(1, -1);
  }
  return name;
}

function buildAliasMapFromFrom(
  from: FromTable | FromTable[] | null,
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  if (!from) {
    return aliasMap;
  }

  const tables = Array.isArray(from) ? from : [from];

  for (const t of tables) {
    if (t.table) {
      const tableName = stripBrackets(t.table);
      if (t.as) {
        aliasMap.set(t.as.toLowerCase(), tableName);
      }
      aliasMap.set(tableName.toLowerCase(), tableName);
    }
  }

  return aliasMap;
}

/**
 * Build a map of table aliases from SQL.
 * Parses FROM and JOIN clauses to map alias -> table name.
 *
 * @param sql - The SQL query to parse
 * @returns Map where keys are lowercase aliases and values are table names.
 *          Tables without aliases use the table name as both key and value.
 *          Returns empty Map on parse errors.
 */
export function buildTableAliasMap(sql: string): Map<string, string> {
  try {
    const ast = parser.astify(sql, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
    const statements = Array.isArray(ast) ? ast : [ast];
    const combinedMap = new Map<string, string>();

    for (const stmt of statements) {
      if (stmt.from) {
        const stmtAliasMap = buildAliasMapFromFrom(stmt.from);
        for (const [alias, table] of stmtAliasMap) {
          combinedMap.set(alias, table);
        }
      }
    }

    return combinedMap;
  } catch {
    return new Map();
  }
}
