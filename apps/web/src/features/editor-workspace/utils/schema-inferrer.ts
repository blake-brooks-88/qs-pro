/**
 * Schema Inferrer - Infer Data Extension field schema from query output
 *
 * Parses SELECT columns and determines appropriate MCE field types
 * based on the query expressions. Adapted from worker/shell-query/schema-inferrer.ts
 * for frontend use.
 */

import { Parser } from "node-sql-parser";

import {
  getSystemDataViewFields,
  isSystemDataView,
} from "@/services/system-data-views";

import type { DataExtensionField, SFMCFieldType } from "../types";

const parser = new Parser();
const DIALECT = "transactsql";

/**
 * Interface for fetching field metadata from data extensions.
 * Used to look up column types when resolving column references.
 */
export interface MetadataFetcher {
  getFieldsForTable(
    tableName: string,
  ): Promise<{ name: string; type: SFMCFieldType; length?: number }[] | null>;
}

// Maps aggregate/function names to their return types
const AGGREGATE_TYPE_MAP = new Map<string, SFMCFieldType>([
  ["COUNT", "Number"],
  ["SUM", "Number"],
  ["AVG", "Decimal"],
  ["STDEV", "Decimal"],
  ["STDEVP", "Decimal"],
  ["VAR", "Decimal"],
  ["VARP", "Decimal"],
]);

const STRING_FUNCTIONS = new Set([
  "CONCAT",
  "LEFT",
  "RIGHT",
  "UPPER",
  "LOWER",
  "LTRIM",
  "RTRIM",
  "TRIM",
  "SUBSTRING",
  "REPLACE",
  "STUFF",
  "REVERSE",
  "CHAR",
  "CHARINDEX",
  "LEN",
  "PATINDEX",
  "QUOTENAME",
  "REPLICATE",
  "SPACE",
  "STR",
  "STRING_AGG",
  "FORMAT",
  "CONCAT_WS",
]);

const DATE_FUNCTIONS = new Set([
  "GETDATE",
  "GETUTCDATE",
  "DATEADD",
  "DATEDIFF",
  "DATENAME",
  "DATEPART",
  "DAY",
  "MONTH",
  "YEAR",
  "EOMONTH",
  "DATEFROMPARTS",
  "DATETIMEFROMPARTS",
  "SYSDATETIME",
  "SYSUTCDATETIME",
  "CURRENT_TIMESTAMP",
  "SWITCHOFFSET",
  "TODATETIMEOFFSET",
]);

const NUMERIC_FUNCTIONS = new Set([
  "LEN",
  "DATALENGTH",
  "CHARINDEX",
  "PATINDEX",
  "DATEPART",
  "DATEDIFF",
  "DAY",
  "MONTH",
  "YEAR",
  "ISNUMERIC",
  "ABS",
  "CEILING",
  "FLOOR",
  "ROUND",
  "SIGN",
  "SQRT",
  "SQUARE",
  "POWER",
  "LOG",
  "LOG10",
  "EXP",
]);

// =============================================================================
// AST Type Definitions
// =============================================================================

interface FunctionNamePart {
  type: string;
  value: string;
}

interface FunctionName {
  name: FunctionNamePart[];
}

interface AstExpression {
  type?: string;
  value?: unknown;
  name?: string | FunctionName;
  args?: { value?: AstExpression[]; type?: string } | AstExpression[];
  column?: string | { expr: { type: string; value: string } };
  table?: string | null;
  left?: AstExpression;
  right?: AstExpression;
  target?: { dataType?: string; length?: number };
  expr?: AstExpression;
  cond?: AstExpression[];
  result?: AstExpression[];
}

interface SelectColumn {
  expr?: AstExpression;
  as?: string | null;
  type?: string;
  column?: string | { expr: { type: string; value: string } };
  table?: string | null;
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
  columns?: Array<SelectColumn | string>;
  from?: FromTable | FromTable[] | null;
  with?: Array<{ name: { value: string }; stmt: AstStatement }>;
  _next?: AstStatement;
  union?: string;
}

// Internal column definition used during inference
interface InternalColumnDef {
  name: string;
  fieldType: SFMCFieldType;
  length?: number;
  scale?: number;
  precision?: number;
  fromFunction?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

function stripBrackets(name: string): string {
  if (name.startsWith("[") && name.endsWith("]")) {
    return name.slice(1, -1);
  }
  return name;
}

function extractFunctionName(name: string | FunctionName | undefined): string {
  if (!name) {
    return "";
  }
  if (typeof name === "string") {
    return name;
  }
  if (name.name && Array.isArray(name.name) && name.name.length > 0) {
    const firstPart = name.name[0];
    return firstPart?.value ?? "";
  }
  return "";
}

function getColumnName(col: SelectColumn | string, index: number): string {
  if (typeof col === "string") {
    return col === "*" ? `Column${index + 1}` : col;
  }

  if (col.as) {
    return typeof col.as === "string" ? col.as : `Column${index + 1}`;
  }

  if (col.type === "column_ref" && col.column) {
    if (typeof col.column === "string") {
      return stripBrackets(col.column);
    }
    if (col.column.expr?.value) {
      return String(col.column.expr.value);
    }
  }

  if (col.expr) {
    if (col.expr.type === "column_ref" && col.expr.column) {
      if (typeof col.expr.column === "string") {
        return stripBrackets(col.expr.column);
      }
      if (col.expr.column.expr?.value) {
        return String(col.expr.column.expr.value);
      }
    }

    if (col.expr.type === "aggr_func" || col.expr.type === "function") {
      const funcName = extractFunctionName(col.expr.name);
      return funcName || "Unknown";
    }
  }

  return `Column${index + 1}`;
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
      const tableName = stripBrackets(t.table);
      if (t.as) {
        aliasMap.set(t.as.toLowerCase(), tableName);
      }
      aliasMap.set(tableName.toLowerCase(), tableName);
    }
  }

  return aliasMap;
}

function buildTableAliasMap(sqlText: string): Map<string, string> {
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

// =============================================================================
// Type Inference
// =============================================================================

async function lookupFieldType(
  tableName: string,
  columnName: string,
  metadataFetcher: MetadataFetcher,
): Promise<{ fieldType: SFMCFieldType; length?: number } | null> {
  const normalizedTable = stripBrackets(tableName);

  let effectiveTableName = normalizedTable;
  if (normalizedTable.toLowerCase().startsWith("ent.")) {
    effectiveTableName = normalizedTable.substring(4);
  }

  // Check system data views first
  if (isSystemDataView(effectiveTableName)) {
    const fields = getSystemDataViewFields(effectiveTableName);
    const field = fields.find(
      (f) => f.Name?.toLowerCase() === columnName.toLowerCase(),
    );
    if (field?.FieldType) {
      return {
        fieldType: field.FieldType as SFMCFieldType,
        length:
          typeof field.MaxLength === "number" ? field.MaxLength : undefined,
      };
    }
    return null;
  }

  // Try metadata fetcher
  const fields = await metadataFetcher.getFieldsForTable(effectiveTableName);
  if (fields) {
    const field = fields.find(
      (f) => f.name.toLowerCase() === columnName.toLowerCase(),
    );
    if (field) {
      return { fieldType: field.type, length: field.length };
    }
  }

  return null;
}

async function inferColumnType(
  expr: AstExpression | undefined,
  aliasMap: Map<string, string>,
  metadataFetcher: MetadataFetcher,
): Promise<InternalColumnDef> {
  if (!expr) {
    return { name: "Unknown", fieldType: "Text", length: 254 };
  }

  // Direct column reference
  if (expr.type === "column_ref") {
    const columnName =
      typeof expr.column === "string"
        ? stripBrackets(expr.column)
        : expr.column?.expr?.value
          ? String(expr.column.expr.value)
          : "Unknown";

    let tableName: string | null = null;
    if (expr.table) {
      const resolved = aliasMap.get(expr.table.toLowerCase());
      tableName = resolved ?? expr.table;
    }

    if (tableName) {
      const fieldType = await lookupFieldType(
        tableName,
        columnName,
        metadataFetcher,
      );
      if (fieldType) {
        return { name: columnName, ...fieldType };
      }
    }

    // Try to find the column in any known table
    for (const table of aliasMap.values()) {
      const fieldType = await lookupFieldType(
        table,
        columnName,
        metadataFetcher,
      );
      if (fieldType) {
        return { name: columnName, ...fieldType };
      }
    }

    return { name: columnName, fieldType: "Text", length: 254 };
  }

  // Aggregate function (COUNT, SUM, AVG, etc.)
  if (expr.type === "aggr_func") {
    const funcName = extractFunctionName(expr.name).toUpperCase();

    if (funcName === "COUNT") {
      return { name: funcName, fieldType: "Number" };
    }

    if (funcName === "AVG") {
      return {
        name: funcName,
        fieldType: "Decimal",
        scale: 2,
        precision: 18,
      };
    }

    if (funcName === "SUM") {
      return { name: funcName, fieldType: "Number" };
    }

    if (funcName === "MIN" || funcName === "MAX") {
      const args = expr.args;
      if (args) {
        const argList = Array.isArray(args) ? args : (args.value ?? []);
        if (argList.length > 0) {
          const argType = await inferColumnType(
            argList[0] as AstExpression,
            aliasMap,
            metadataFetcher,
          );
          return { ...argType, name: funcName };
        }
      }
      return { name: funcName, fieldType: "Text", length: 254 };
    }

    const mappedType = AGGREGATE_TYPE_MAP.get(funcName);
    if (mappedType) {
      if (mappedType === "Decimal") {
        return {
          name: funcName,
          fieldType: "Decimal",
          scale: 2,
          precision: 18,
        };
      }
      return { name: funcName, fieldType: mappedType };
    }

    return { name: funcName, fieldType: "Number" };
  }

  // Regular function
  if (expr.type === "function") {
    const funcName = extractFunctionName(expr.name).toUpperCase();

    if (STRING_FUNCTIONS.has(funcName)) {
      return {
        name: funcName,
        fieldType: "Text",
        length: 4000,
        fromFunction: true,
      };
    }

    if (DATE_FUNCTIONS.has(funcName)) {
      // Some date functions return numbers
      if (["DAY", "MONTH", "YEAR", "DATEPART", "DATEDIFF"].includes(funcName)) {
        return { name: funcName, fieldType: "Number" };
      }
      return { name: funcName, fieldType: "Date" };
    }

    if (NUMERIC_FUNCTIONS.has(funcName)) {
      return { name: funcName, fieldType: "Number" };
    }

    return {
      name: funcName,
      fieldType: "Text",
      length: 4000,
      fromFunction: true,
    };
  }

  // CAST/CONVERT
  if (expr.type === "cast" || expr.type === "convert") {
    const targetType = expr.target?.dataType?.toUpperCase() ?? "";
    const length = expr.target?.length;

    if (
      targetType.includes("INT") ||
      targetType === "BIGINT" ||
      targetType === "SMALLINT" ||
      targetType === "TINYINT"
    ) {
      return { name: "Cast", fieldType: "Number" };
    }

    if (
      targetType.includes("DECIMAL") ||
      targetType.includes("NUMERIC") ||
      targetType.includes("FLOAT") ||
      targetType.includes("REAL") ||
      targetType.includes("MONEY")
    ) {
      return { name: "Cast", fieldType: "Decimal", scale: 2, precision: 18 };
    }

    if (
      targetType.includes("DATE") ||
      targetType.includes("TIME") ||
      targetType.includes("DATETIME")
    ) {
      return { name: "Cast", fieldType: "Date" };
    }

    if (
      targetType.includes("CHAR") ||
      targetType.includes("VARCHAR") ||
      targetType.includes("TEXT") ||
      targetType.includes("NVARCHAR") ||
      targetType.includes("NCHAR")
    ) {
      return {
        name: "Cast",
        fieldType: "Text",
        length: length ?? 254,
        fromFunction: true,
      };
    }

    if (targetType === "BIT") {
      return { name: "Cast", fieldType: "Boolean" };
    }

    return {
      name: "Cast",
      fieldType: "Text",
      length: 254,
      fromFunction: true,
    };
  }

  // CASE expression
  if (expr.type === "case") {
    const results = expr.result ?? [];
    if (results.length > 0) {
      const firstResult = await inferColumnType(
        results[0] as AstExpression,
        aliasMap,
        metadataFetcher,
      );
      return { ...firstResult, name: "Case" };
    }
    return { name: "Case", fieldType: "Text", length: 254 };
  }

  // Literal values
  if (expr.type === "string" || expr.type === "single_quote_string") {
    return { name: "Literal", fieldType: "Text", length: 254 };
  }

  if (expr.type === "number") {
    const value = expr.value;
    if (typeof value === "number" && !Number.isInteger(value)) {
      return { name: "Literal", fieldType: "Decimal", scale: 2, precision: 18 };
    }
    return { name: "Literal", fieldType: "Number" };
  }

  if (expr.type === "bool") {
    return { name: "Literal", fieldType: "Boolean" };
  }

  if (expr.type === "null") {
    return { name: "Literal", fieldType: "Text", length: 254 };
  }

  // Binary expressions (arithmetic)
  if (expr.type === "binary_expr") {
    const leftType = await inferColumnType(
      expr.left,
      aliasMap,
      metadataFetcher,
    );
    const rightType = await inferColumnType(
      expr.right,
      aliasMap,
      metadataFetcher,
    );

    if (
      leftType.fieldType === "Number" ||
      rightType.fieldType === "Number" ||
      leftType.fieldType === "Decimal" ||
      rightType.fieldType === "Decimal"
    ) {
      if (
        leftType.fieldType === "Decimal" ||
        rightType.fieldType === "Decimal"
      ) {
        return {
          name: "Expression",
          fieldType: "Decimal",
          scale: 2,
          precision: 18,
        };
      }
      return { name: "Expression", fieldType: "Number" };
    }

    return { name: "Expression", fieldType: "Text", length: 254 };
  }

  // Default fallback
  return { name: "Unknown", fieldType: "Text", length: 254 };
}

function sanitizeColumnName(name: string, existingNames: Set<string>): string {
  let sanitized = name;

  // Truncate names > 50 chars to first 45 chars
  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 45);
  }

  // Handle duplicates
  let finalName = sanitized;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${sanitized}_${counter}`;
    counter++;
  }

  existingNames.add(finalName.toLowerCase());
  return finalName;
}

function applyFieldPropertyMapping(col: InternalColumnDef): InternalColumnDef {
  const result = { ...col };

  switch (result.fieldType) {
    case "Text":
      if (result.fromFunction) {
        result.length = result.length ?? 4000;
      } else {
        result.length = result.length ?? 254;
      }
      break;
    case "Decimal":
      result.scale = result.scale ?? 2;
      result.precision = result.precision ?? 18;
      break;
    case "Number":
    case "Date":
    case "Boolean":
    case "EmailAddress":
    case "Phone":
      // No extra properties needed
      break;
    default:
      // Unknown type - default to Text
      result.fieldType = "Text";
      result.length = 254;
  }

  return result;
}

function toDataExtensionField(col: InternalColumnDef): DataExtensionField {
  const field: DataExtensionField = {
    id: crypto.randomUUID(),
    name: col.name,
    type: col.fieldType,
    isPrimaryKey: false,
    isNullable: true,
  };

  if (col.length !== undefined) {
    field.length = col.length;
  }

  if (col.scale !== undefined) {
    field.scale = col.scale;
  }

  if (col.precision !== undefined) {
    field.precision = col.precision;
  }

  return field;
}

// =============================================================================
// Main Export
// =============================================================================

/**
 * Infer Data Extension field schema from a SQL SELECT query.
 *
 * @param sql - The SQL query to analyze
 * @param metadataFetcher - Interface to fetch field metadata for data extensions
 * @returns Array of DataExtensionField with inferred types
 * @throws Error if the SQL cannot be parsed or no columns are found
 */
export async function inferSchemaFromQuery(
  sql: string,
  metadataFetcher: MetadataFetcher,
): Promise<DataExtensionField[]> {
  let ast: AstStatement | AstStatement[];

  try {
    ast = parser.astify(sql, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
  } catch (error) {
    throw new Error(
      `Failed to parse SQL query: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  const fields: DataExtensionField[] = [];
  const existingNames = new Set<string>();
  const aliasMap = buildTableAliasMap(sql);

  for (const stmt of statements) {
    if (stmt.type !== "select" || !stmt.columns) {
      continue;
    }

    for (let i = 0; i < stmt.columns.length; i++) {
      const col = stmt.columns.at(i);

      // Skip undefined entries
      if (col === undefined) {
        continue;
      }

      // Skip star columns (should be expanded before calling inferSchemaFromQuery)
      if (typeof col === "string" && col === "*") {
        continue;
      }
      if (
        typeof col === "object" &&
        col !== null &&
        "type" in col &&
        col.type === "star"
      ) {
        continue;
      }

      // Skip column_ref with column "*"
      if (
        typeof col === "object" &&
        col !== null &&
        "expr" in col &&
        col.expr?.type === "column_ref" &&
        col.expr.column === "*"
      ) {
        continue;
      }

      const colName = getColumnName(col, i);
      const sanitizedName = sanitizeColumnName(colName, existingNames);

      let colDef: InternalColumnDef;

      if (typeof col === "object" && col !== null && "expr" in col) {
        colDef = await inferColumnType(
          col.expr as AstExpression,
          aliasMap,
          metadataFetcher,
        );
        colDef.name = sanitizedName;
      } else if (
        typeof col === "object" &&
        col !== null &&
        "type" in col &&
        col.type === "column_ref"
      ) {
        colDef = await inferColumnType(
          col as unknown as AstExpression,
          aliasMap,
          metadataFetcher,
        );
        colDef.name = sanitizedName;
      } else {
        colDef = {
          name: sanitizedName,
          fieldType: "Text",
          length: 254,
        };
      }

      const finalColDef = applyFieldPropertyMapping(colDef);
      fields.push(toDataExtensionField(finalColDef));
    }
  }

  if (fields.length === 0) {
    throw new Error(
      "No columns found in query. Ensure the query is a valid SELECT statement.",
    );
  }

  return fields;
}
