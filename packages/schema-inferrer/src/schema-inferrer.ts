import type {
  MCEFieldType,
  InferredField,
  FieldTypeConstraints,
  MetadataFetcher,
  InferResult,
} from "./types";
import { normalizeFieldType } from "./type-normalizer";
import {
  AGGREGATE_TYPE_MAP,
  STRING_FUNCTIONS,
  DATE_FUNCTIONS,
  NUMERIC_FUNCTIONS,
} from "./function-maps";
import { stripBrackets, buildTableAliasMap } from "./sql-utils";
import {
  isSystemDataView,
  getSystemDataViewFields,
  type SystemDataViewField,
} from "./system-data-views";
import nodeSqlParser from "node-sql-parser";

const parser = new nodeSqlParser.Parser();
const DIALECT = "transactsql";

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

interface AstStatement {
  type?: string;
  columns?: Array<SelectColumn | string>;
  from?: unknown;
}

interface InternalField {
  Name: string;
  FieldType: MCEFieldType;
  MaxLength?: number;
  Scale?: number;
  Precision?: number;
  fromFunction?: boolean;
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

async function inferColumnType(
  expr: AstExpression | undefined,
  aliasMap: Map<string, string>,
  metadataFetcher: MetadataFetcher
): Promise<InternalField> {
  if (!expr) {
    return { Name: "Unknown", FieldType: "Text", MaxLength: 254 };
  }

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
        metadataFetcher
      );
      if (fieldType) {
        return { Name: columnName, ...fieldType };
      }
    }

    for (const table of aliasMap.values()) {
      const fieldType = await lookupFieldType(table, columnName, metadataFetcher);
      if (fieldType) {
        return { Name: columnName, ...fieldType };
      }
    }

    return { Name: columnName, FieldType: "Text", MaxLength: 254 };
  }

  if (expr.type === "aggr_func") {
    const funcName = extractFunctionName(expr.name).toUpperCase();

    if (funcName === "COUNT") {
      return { Name: funcName, FieldType: "Number" };
    }

    if (funcName === "AVG") {
      return {
        Name: funcName,
        FieldType: "Decimal",
        Scale: 2,
        Precision: 18,
      };
    }

    if (funcName === "SUM") {
      return { Name: funcName, FieldType: "Number" };
    }

    if (funcName === "MIN" || funcName === "MAX") {
      const args = expr.args;
      if (args) {
        const argList = Array.isArray(args) ? args : (args.value ?? []);
        if (argList.length > 0) {
          const argType = await inferColumnType(
            argList[0] as AstExpression,
            aliasMap,
            metadataFetcher
          );
          return { ...argType, Name: funcName };
        }
      }
      return { Name: funcName, FieldType: "Text", MaxLength: 254 };
    }

    const mappedType = AGGREGATE_TYPE_MAP.get(funcName);
    if (mappedType) {
      if (mappedType === "Decimal") {
        return {
          Name: funcName,
          FieldType: "Decimal",
          Scale: 2,
          Precision: 18,
        };
      }
      return { Name: funcName, FieldType: mappedType };
    }

    return { Name: funcName, FieldType: "Number" };
  }

  if (expr.type === "function") {
    const funcName = extractFunctionName(expr.name).toUpperCase();

    if (STRING_FUNCTIONS.has(funcName)) {
      return {
        Name: funcName,
        FieldType: "Text",
        MaxLength: 4000,
        fromFunction: true,
      };
    }

    if (DATE_FUNCTIONS.has(funcName)) {
      if (["DAY", "MONTH", "YEAR", "DATEPART", "DATEDIFF"].includes(funcName)) {
        return { Name: funcName, FieldType: "Number" };
      }
      return { Name: funcName, FieldType: "Date" };
    }

    if (NUMERIC_FUNCTIONS.has(funcName)) {
      return { Name: funcName, FieldType: "Number" };
    }

    return {
      Name: funcName,
      FieldType: "Text",
      MaxLength: 4000,
      fromFunction: true,
    };
  }

  if (expr.type === "cast" || expr.type === "convert") {
    const targetType = expr.target?.dataType?.toUpperCase() ?? "";
    const length = expr.target?.length;

    if (
      targetType.includes("INT") ||
      targetType === "BIGINT" ||
      targetType === "SMALLINT" ||
      targetType === "TINYINT"
    ) {
      return { Name: "Cast", FieldType: "Number" };
    }

    if (
      targetType.includes("DECIMAL") ||
      targetType.includes("NUMERIC") ||
      targetType.includes("FLOAT") ||
      targetType.includes("REAL") ||
      targetType.includes("MONEY")
    ) {
      return { Name: "Cast", FieldType: "Decimal", Scale: 2, Precision: 18 };
    }

    if (
      targetType.includes("DATE") ||
      targetType.includes("TIME") ||
      targetType.includes("DATETIME")
    ) {
      return { Name: "Cast", FieldType: "Date" };
    }

    if (
      targetType.includes("CHAR") ||
      targetType.includes("VARCHAR") ||
      targetType.includes("TEXT") ||
      targetType.includes("NVARCHAR") ||
      targetType.includes("NCHAR")
    ) {
      return {
        Name: "Cast",
        FieldType: "Text",
        MaxLength: length ?? 254,
        fromFunction: true,
      };
    }

    if (targetType === "BIT") {
      return { Name: "Cast", FieldType: "Boolean" };
    }

    return {
      Name: "Cast",
      FieldType: "Text",
      MaxLength: 254,
      fromFunction: true,
    };
  }

  if (expr.type === "case") {
    const results = expr.result ?? [];
    if (results.length > 0) {
      const firstResult = await inferColumnType(
        results[0] as AstExpression,
        aliasMap,
        metadataFetcher
      );
      return { ...firstResult, Name: "Case" };
    }
    return { Name: "Case", FieldType: "Text", MaxLength: 254 };
  }

  if (expr.type === "string" || expr.type === "single_quote_string") {
    return { Name: "Literal", FieldType: "Text", MaxLength: 254 };
  }

  if (expr.type === "number") {
    const value = expr.value;
    if (typeof value === "number" && !Number.isInteger(value)) {
      return { Name: "Literal", FieldType: "Decimal", Scale: 2, Precision: 18 };
    }
    return { Name: "Literal", FieldType: "Number" };
  }

  if (expr.type === "bool") {
    return { Name: "Literal", FieldType: "Boolean" };
  }

  if (expr.type === "null") {
    return { Name: "Literal", FieldType: "Text", MaxLength: 254 };
  }

  if (expr.type === "binary_expr") {
    const leftType = await inferColumnType(expr.left, aliasMap, metadataFetcher);
    const rightType = await inferColumnType(expr.right, aliasMap, metadataFetcher);

    if (
      leftType.FieldType === "Number" ||
      rightType.FieldType === "Number" ||
      leftType.FieldType === "Decimal" ||
      rightType.FieldType === "Decimal"
    ) {
      if (
        leftType.FieldType === "Decimal" ||
        rightType.FieldType === "Decimal"
      ) {
        return {
          Name: "Expression",
          FieldType: "Decimal",
          Scale: 2,
          Precision: 18,
        };
      }
      return { Name: "Expression", FieldType: "Number" };
    }

    return { Name: "Expression", FieldType: "Text", MaxLength: 254 };
  }

  return { Name: "Unknown", FieldType: "Text", MaxLength: 254 };
}

async function lookupFieldType(
  tableName: string,
  columnName: string,
  metadataFetcher: MetadataFetcher
): Promise<{ FieldType: MCEFieldType; MaxLength?: number } | null> {
  const normalizedTable = stripBrackets(tableName);

  let effectiveTableName = normalizedTable;
  if (normalizedTable.toLowerCase().startsWith("ent.")) {
    effectiveTableName = normalizedTable.substring(4);
  }

  if (isSystemDataView(effectiveTableName)) {
    const fields = getSystemDataViewFields(effectiveTableName);
    const field = fields.find(
      (f: SystemDataViewField) => f.Name.toLowerCase() === columnName.toLowerCase()
    );
    if (field) {
      return { FieldType: field.FieldType, MaxLength: field.MaxLength };
    }
    return null;
  }

  const fields = await metadataFetcher.getFieldsForTable(effectiveTableName);
  if (fields) {
    const field = fields.find(
      (f) => f.Name.toLowerCase() === columnName.toLowerCase()
    );
    if (field) {
      const normalizedType = normalizeFieldType(field.FieldType);
      return { FieldType: normalizedType, MaxLength: field.MaxLength };
    }
  }

  return null;
}

function sanitizeColumnName(name: string, existingNames: Set<string>): string {
  let sanitized = name;

  if (sanitized.length > 50) {
    sanitized = sanitized.substring(0, 45);
  }

  let finalName = sanitized;
  let counter = 1;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${sanitized}_${counter}`;
    counter++;
  }

  existingNames.add(finalName.toLowerCase());
  return finalName;
}

function applyFieldPropertyMapping(col: InternalField): InferredField {
  const result: InferredField = {
    Name: col.Name,
    FieldType: col.FieldType,
  };

  switch (col.FieldType) {
    case "Text":
      if (col.fromFunction) {
        result.MaxLength = col.MaxLength ?? 4000;
      } else {
        result.MaxLength = col.MaxLength ?? 254;
      }
      break;
    case "Decimal":
      result.Scale = col.Scale ?? 2;
      result.Precision = col.Precision ?? 18;
      break;
    case "Number":
    case "Date":
    case "Boolean":
    case "EmailAddress":
    case "Phone":
    case "Locale":
      break;
    default: {
      const normalized = normalizeFieldType(col.FieldType);
      result.FieldType = normalized;
      if (normalized === "Text") {
        result.MaxLength = 254;
      }
    }
  }

  return result;
}

function isStarColumn(col: SelectColumn | string): boolean {
  if (typeof col === "string" && col === "*") {
    return true;
  }
  if (
    typeof col === "object" &&
    col !== null &&
    "type" in col &&
    col.type === "star"
  ) {
    return true;
  }
  if (
    typeof col === "object" &&
    col !== null &&
    "expr" in col &&
    col.expr &&
    col.expr.type === "column_ref" &&
    col.expr.column === "*"
  ) {
    return true;
  }
  return false;
}

export async function inferSchema(
  sql: string,
  metadataFetcher: MetadataFetcher
): Promise<InferResult> {
  let ast: AstStatement | AstStatement[];

  try {
    ast = parser.astify(sql, { database: DIALECT }) as unknown as
      | AstStatement
      | AstStatement[];
  } catch (err) {
    return {
      success: false,
      error: {
        code: "PARSE_ERROR",
        message: err instanceof Error ? err.message : "Failed to parse SQL",
        sql,
      },
    };
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  const fields: InferredField[] = [];
  const existingNames = new Set<string>();
  const aliasMap = buildTableAliasMap(sql);

  for (const stmt of statements) {
    if (stmt.type !== "select" || !stmt.columns) {
      continue;
    }

    for (let i = 0; i < stmt.columns.length; i++) {
      const col = stmt.columns[i];

      if (col === undefined) {
        continue;
      }

      if (isStarColumn(col)) {
        return {
          success: false,
          error: {
            code: "NO_COLUMNS",
            message:
              "SELECT * is not supported for schema inference. Please specify columns explicitly.",
            sql,
          },
        };
      }

      const colName = getColumnName(col, i);
      const sanitizedName = sanitizeColumnName(colName, existingNames);

      let internalField: InternalField;

      if (typeof col === "object" && col !== null && "expr" in col) {
        internalField = await inferColumnType(
          col.expr as AstExpression,
          aliasMap,
          metadataFetcher
        );
        internalField.Name = sanitizedName;
      } else if (
        typeof col === "object" &&
        col !== null &&
        "type" in col &&
        col.type === "column_ref"
      ) {
        internalField = await inferColumnType(
          col as unknown as AstExpression,
          aliasMap,
          metadataFetcher
        );
        internalField.Name = sanitizedName;
      } else {
        internalField = {
          Name: sanitizedName,
          FieldType: "Text",
          MaxLength: 254,
        };
      }

      fields.push(applyFieldPropertyMapping(internalField));
    }
  }

  if (fields.length === 0) {
    return {
      success: false,
      error: {
        code: "NO_COLUMNS",
        message: "No columns found in query",
        sql,
      },
    };
  }

  return { success: true, fields };
}

export function inferFieldTypeFromMetadata(
  metadataType: string
): FieldTypeConstraints {
  const typeStr = (metadataType || "").trim();

  const textMatch = typeStr.match(/^Text\s*\((\d+)\)$/i);
  if (textMatch && textMatch[1]) {
    return {
      FieldType: "Text",
      MaxLength: parseInt(textMatch[1], 10),
    };
  }

  const decimalMatch = typeStr.match(/^Decimal\s*\((\d+)\s*,\s*(\d+)\)$/i);
  if (decimalMatch && decimalMatch[1] && decimalMatch[2]) {
    return {
      FieldType: "Decimal",
      Precision: parseInt(decimalMatch[1], 10),
      Scale: parseInt(decimalMatch[2], 10),
    };
  }

  const normalized = normalizeFieldType(typeStr);

  switch (normalized) {
    case "Number":
      return { FieldType: "Number" };
    case "Decimal":
      return { FieldType: "Decimal", Scale: 2, Precision: 18 };
    case "Date":
      return { FieldType: "Date" };
    case "Boolean":
      return { FieldType: "Boolean" };
    case "EmailAddress":
      return { FieldType: "EmailAddress" };
    case "Phone":
      return { FieldType: "Phone" };
    case "Locale":
      return { FieldType: "Locale" };
    case "Text":
    default:
      return { FieldType: "Text", MaxLength: 254 };
  }
}
