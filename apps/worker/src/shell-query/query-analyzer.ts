/**
 * Query Analyzer - SELECT * expansion and table extraction
 *
 * Parses SQL using node-sql-parser to identify SELECT * clauses
 * and expand them to explicit column lists using metadata.
 */

import { AppError, ErrorCode } from "@qpp/backend-shared";
import { type AST, Parser } from "node-sql-parser";

import {
  type DataViewField,
  getSystemDataViewFields,
  isSystemDataView,
} from "./system-data-views";

const parser = new Parser();
const DIALECT = "transactsql";

export interface FieldDefinition {
  Name: string;
  FieldType: string;
  MaxLength?: number;
}

export interface MetadataFetcher {
  getFieldsForTable(tableName: string): Promise<FieldDefinition[] | null>;
}

interface ExprColumn {
  type: string;
  table: string | null;
  column: string;
}

interface SelectColumnWithExpr {
  expr: ExprColumn;
  as: string | null;
}

interface FromTable {
  table?: string;
  as?: string;
  db?: string;
  expr?: AstStatement;
  join?: string;
  on?: unknown;
}

interface AstStatement {
  type?: string;
  columns?: SelectColumnWithExpr[];
  from?: FromTable | FromTable[] | null;
  with?: Array<{ name: { value: string }; stmt: AstStatement }>;
  _next?: AstStatement;
  union?: string;
}

function stripBrackets(name: string): string {
  if (name.startsWith("[") && name.endsWith("]")) {
    return name.slice(1, -1);
  }
  return name;
}

function normalizeTableName(name: string): string {
  return stripBrackets(name);
}

function buildAliasMap(
  from: FromTable | FromTable[] | null,
): Map<string, string> {
  const aliasMap = new Map<string, string>();
  if (!from) {
    return aliasMap;
  }

  const tables = Array.isArray(from) ? from : [from];

  for (const t of tables) {
    if (t.table) {
      const tableName = normalizeTableName(t.table);
      if (t.as) {
        aliasMap.set(t.as.toLowerCase(), tableName);
      }
      aliasMap.set(tableName.toLowerCase(), tableName);
    }
  }

  return aliasMap;
}

function getSubselectFromFromItem(expr: unknown): AstStatement | null {
  if (!expr || typeof expr !== "object") {
    return null;
  }

  // Some dialects/structures return the subselect directly as the expr.
  if ((expr as { type?: unknown }).type === "select") {
    return expr as AstStatement;
  }

  // Derived tables are represented as an object with an `ast` property.
  const nested = (expr as { ast?: unknown }).ast;
  if (nested && typeof nested === "object") {
    if ((nested as { type?: unknown }).type === "select") {
      return nested as AstStatement;
    }
  }

  return null;
}

function extractTablesFromFrom(from: FromTable | FromTable[] | null): string[] {
  const tables: string[] = [];
  if (!from) {
    return tables;
  }

  const fromItems = Array.isArray(from) ? from : [from];

  for (const item of fromItems) {
    if (item.table) {
      tables.push(normalizeTableName(item.table));
    }
    const subSelect = getSubselectFromFromItem(item.expr);
    if (subSelect) {
      const subTables = extractTablesFromFrom(subSelect.from ?? null);
      tables.push(...subTables);
    }
  }

  return tables;
}

function hasSelectStar(columns: SelectColumnWithExpr[] | undefined): boolean {
  if (!columns) {
    return false;
  }

  for (const col of columns) {
    // Structure: { expr: { type: "column_ref", table: null, column: "*" }, as: null }
    if (col.expr && col.expr.type === "column_ref" && col.expr.column === "*") {
      return true;
    }
  }

  return false;
}

function hasUnqualifiedSelectStar(
  columns: SelectColumnWithExpr[] | undefined,
): boolean {
  if (!columns) {
    return false;
  }

  for (const col of columns) {
    if (
      col.expr &&
      col.expr.type === "column_ref" &&
      col.expr.column === "*" &&
      !col.expr.table
    ) {
      return true;
    }
  }

  return false;
}

function getStarTablePrefix(
  columns: SelectColumnWithExpr[] | undefined,
): string | null {
  if (!columns) {
    return null;
  }

  for (const col of columns) {
    if (col.expr && col.expr.type === "column_ref" && col.expr.column === "*") {
      if (col.expr.table) {
        return col.expr.table;
      }
    }
  }

  return null;
}

async function getFieldsForTable(
  tableName: string,
  metadataFn: MetadataFetcher,
): Promise<FieldDefinition[]> {
  const normalized = normalizeTableName(tableName);

  let effectiveTableName = normalized;
  if (normalized.toLowerCase().startsWith("ent.")) {
    effectiveTableName = normalized.substring(4);
  }

  if (isSystemDataView(effectiveTableName)) {
    const fields = getSystemDataViewFields(effectiveTableName);
    return fields.map((f: DataViewField) => ({
      Name: f.Name,
      FieldType: f.FieldType,
      MaxLength: f.MaxLength,
    }));
  }

  const fields = await metadataFn.getFieldsForTable(effectiveTableName);
  if (!fields) {
    throw new AppError(ErrorCode.SELECT_STAR_EXPANSION_FAILED);
  }

  return fields;
}

function needsBracketQuoting(name: string): boolean {
  return !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || name.includes("]");
}

function bracketQuote(name: string): string {
  const escaped = name.replace(/\]/g, "]]");
  return `[${escaped}]`;
}

function buildExpandedColumnList(
  fields: FieldDefinition[],
  tableAlias: string | null,
): string {
  return fields
    .map((f) => {
      if (f.Name.includes("]")) {
        throw new AppError(ErrorCode.SELECT_STAR_EXPANSION_FAILED);
      }
      const colName = needsBracketQuoting(f.Name)
        ? bracketQuote(f.Name)
        : f.Name;
      return tableAlias ? `${tableAlias}.${colName}` : colName;
    })
    .join(", ");
}

export function replaceStarInQuery(
  sql: string,
  expandedColumns: string,
  starExpr: { table: string | null },
): string {
  try {
    const ast = parser.astify(sql, { database: DIALECT }) as AstStatement;

    if (!ast.columns || !Array.isArray(ast.columns)) {
      return sql;
    }

    const columns = ast.columns as SelectColumnWithExpr[];

    const starIndex = columns.findIndex(
      (col) =>
        col.expr?.type === "column_ref" &&
        col.expr?.column === "*" &&
        col.expr?.table === starExpr.table,
    );

    if (starIndex === -1) {
      return sql;
    }

    const helperSql = `SELECT ${expandedColumns} FROM _placeholder_`;
    const helperAst = parser.astify(helperSql, {
      database: DIALECT,
    }) as AstStatement;
    const expandedCols = helperAst.columns as SelectColumnWithExpr[];

    columns.splice(starIndex, 1, ...expandedCols);
    ast.columns = columns;

    return parser.sqlify(ast as unknown as AST, { database: DIALECT });
  } catch {
    return sql;
  }
}

export async function expandSelectStar(
  sqlText: string,
  metadataFn: MetadataFetcher,
): Promise<string> {
  let ast: AstStatement | AstStatement[];

  try {
    ast = parser.astify(sqlText, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
  } catch {
    return sqlText;
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  let result = sqlText;

  for (const stmt of statements) {
    if (stmt.type !== "select") {
      continue;
    }
    if (!hasSelectStar(stmt.columns)) {
      continue;
    }

    const aliasMap = buildAliasMap(stmt.from ?? null);
    const tables = extractTablesFromFrom(stmt.from ?? null);

    const firstTable = tables[0];
    if (!firstTable) {
      continue;
    }

    const starTablePrefix = getStarTablePrefix(stmt.columns);

    if (hasUnqualifiedSelectStar(stmt.columns) && tables.length > 1) {
      throw new AppError(ErrorCode.SELECT_STAR_EXPANSION_FAILED);
    }

    let targetTable: string;

    if (starTablePrefix) {
      const resolvedTable = aliasMap.get(starTablePrefix.toLowerCase());
      targetTable = resolvedTable ?? normalizeTableName(starTablePrefix);
    } else {
      targetTable = firstTable;
    }

    const fields = await getFieldsForTable(targetTable, metadataFn);
    const tableAlias = starTablePrefix ?? null;
    const expandedColumns = buildExpandedColumnList(fields, tableAlias);

    result = replaceStarInQuery(result, expandedColumns, { table: tableAlias });
  }

  return result;
}

function fallbackContainsSelectStar(sqlText: string): boolean {
  const upper = sqlText.toUpperCase();
  const selectIdx = upper.indexOf("SELECT");
  if (selectIdx === -1) {
    return false;
  }
  const fromIdx = upper.indexOf("FROM", selectIdx);
  if (fromIdx === -1) {
    return false;
  }
  const between = sqlText.slice(selectIdx + 6, fromIdx);
  return between.includes("*");
}

export function containsSelectStar(sqlText: string): boolean {
  try {
    const ast = parser.astify(sqlText, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      if (stmt.type === "select" && hasSelectStar(stmt.columns)) {
        return true;
      }
    }
  } catch {
    return fallbackContainsSelectStar(sqlText);
  }

  return false;
}

export function extractTableNames(sqlText: string): string[] {
  try {
    const ast = parser.astify(sqlText, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
    const statements = Array.isArray(ast) ? ast : [ast];
    const tables: string[] = [];

    for (const stmt of statements) {
      if (stmt.from) {
        tables.push(...extractTablesFromFrom(stmt.from));
      }
    }

    return [...new Set(tables)];
  } catch {
    return [];
  }
}

export function buildTableAliasMap(sqlText: string): Map<string, string> {
  try {
    const ast = parser.astify(sqlText, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
    const statements = Array.isArray(ast) ? ast : [ast];
    const combinedMap = new Map<string, string>();

    for (const stmt of statements) {
      if (stmt.from) {
        const stmtAliasMap = buildAliasMap(stmt.from);
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
