import { Parser } from "node-sql-parser";

const sqlParser = new Parser();
const DIALECT = "transactsql";

type ExtractionResult =
  | { ok: true; names: string[] }
  | { ok: false; reason: string };

function stripBrackets(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function extractOutputColumnNames(sqlText: string): ExtractionResult {
  let ast: unknown;
  try {
    ast = sqlParser.astify(sqlText, { database: DIALECT });
  } catch (error) {
    return {
      ok: false,
      reason: `Failed to parse SQL: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }

  const statements = Array.isArray(ast) ? ast : [ast];
  const selectStmt = statements.find(
    (stmt): stmt is { type?: unknown; columns?: unknown[] } =>
      Boolean(
        stmt &&
        typeof stmt === "object" &&
        (stmt as { type?: unknown }).type === "select",
      ),
  );

  if (!selectStmt || !Array.isArray(selectStmt.columns)) {
    return { ok: false, reason: "No SELECT statement found" };
  }

  const names: string[] = [];

  for (let i = 0; i < selectStmt.columns.length; i++) {
    const col = selectStmt.columns[i] as unknown;

    if (col === "*") {
      return {
        ok: false,
        reason: "SELECT * cannot be validated for compatibility",
      };
    }

    if (!col || typeof col !== "object") {
      return { ok: false, reason: "Unsupported SELECT column" };
    }

    const record = col as {
      as?: unknown;
      expr?: { type?: unknown; column?: unknown } | undefined;
      type?: unknown;
      column?: unknown;
    };

    if (typeof record.as === "string" && record.as.trim()) {
      names.push(stripBrackets(record.as));
      continue;
    }

    const expr = record.expr;
    const isColumnRef =
      expr?.type === "column_ref" || record.type === "column_ref";
    const columnValue = (expr?.column ?? record.column) as unknown;

    if (isColumnRef) {
      if (columnValue === "*") {
        return {
          ok: false,
          reason: "SELECT * cannot be validated for compatibility",
        };
      }
      if (typeof columnValue === "string" && columnValue.trim()) {
        names.push(stripBrackets(columnValue));
        continue;
      }
    }

    return {
      ok: false,
      reason: "Cannot validate computed columns without an explicit AS alias",
    };
  }

  return { ok: true, names };
}
