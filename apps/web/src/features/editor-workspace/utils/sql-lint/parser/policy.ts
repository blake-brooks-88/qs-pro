/**
 * MCE Policy Validation Layer
 *
 * This module provides AST-based policy checks for MCE SQL restrictions.
 * It enforces constraints from MCE-SQL-REFERENCE.md using the parsed AST.
 *
 * Policy checks handled here:
 * 1. Statement type allowlist (only SELECT)
 * 2. Prohibited statements (INSERT, UPDATE, DELETE, etc.)
 * 3. CTE detection (WITH clause)
 * 4. LIMIT clause prohibition (use TOP instead)
 * 5. Unsupported functions detection
 */

import type { SqlDiagnostic } from "../types";
import { MCE_SQL_UNSUPPORTED_FUNCTIONS } from "@/constants/mce-sql";
import { MC } from "@/constants/marketing-cloud";

// Statement types that are allowed in MCE Query Studio
const ALLOWED_STATEMENT_TYPES = new Set(["select"]);

// Statement types that are explicitly prohibited with specific messages
const PROHIBITED_STATEMENT_TYPES: Record<string, string> = {
  insert: `${MC.SHORT} SQL is read-only — INSERT statements are not allowed. To add data, use the Query Activity's data action or the ${MC.SHORT} UI.`,
  update: `${MC.SHORT} SQL is read-only — UPDATE statements are not allowed. To modify data, use the Query Activity's 'Update' data action.`,
  delete: `${MC.SHORT} SQL is read-only — DELETE statements are not allowed.`,
  create: `${MC.SHORT} SQL is read-only — CREATE statements (DDL) are not allowed.`,
  alter: `${MC.SHORT} SQL is read-only — ALTER statements (DDL) are not allowed.`,
  drop: `${MC.SHORT} SQL is read-only — DROP statements (DDL) are not allowed.`,
  truncate: `${MC.SHORT} SQL is read-only — TRUNCATE statements are not allowed.`,
  merge: `${MC.SHORT} SQL is read-only — MERGE statements are not allowed.`,
};

/**
 * Shape of limit clause in the AST
 * Can be either:
 * - MySQL style: { seperator: '', value: [...] }
 * - T-SQL style: { offset: {...}, fetch: {...} }
 */
interface LimitClause {
  /** Present for MySQL LIMIT syntax */
  value?: unknown[];
  /** Present for T-SQL OFFSET/FETCH syntax */
  offset?: unknown;
  fetch?: unknown;
  seperator?: string;
}

/**
 * Shape of a function call in the AST
 */
interface AstFunction {
  type: "function" | "aggr_func";
  name:
    | string
    | {
        name: Array<{ type: string; value: string }>;
      };
  args?:
    | AstExpression
    | AstExpression[]
    | { expr: AstExpression[]; type?: string; value?: unknown[] }
    | null;
  over?: unknown;
}

/**
 * Expression node shape (recursive)
 */
interface AstExpression {
  type: string;
  value?: unknown | SubqueryValue[];
  left?: AstExpression;
  right?: AstExpression;
  expr?: AstExpression | AstExpression[];
  args?:
    | AstExpression
    | AstExpression[]
    | { expr: AstExpression[]; type?: string; value?: unknown[] }
    | null;
  name?:
    | string
    | {
        name: Array<{ type: string; value: string }>;
      };
  over?: unknown;
}

/**
 * Subquery value shape (inside IN clause)
 */
interface SubqueryValue {
  ast?: AstStatement;
}

/**
 * Column reference shape
 */
interface AstColumn {
  expr: AstExpression;
  as?: string | null;
}

/**
 * Basic shape of an AST statement from node-sql-parser.
 * Extended to include properties needed for policy and function detection.
 */
export interface AstStatement {
  type: string;
  with?: unknown[] | null;
  limit?: LimitClause | null;
  from?: AstTableRef[] | null;
  columns?: AstColumn[] | "*";
  where?: AstExpression | null;
  groupby?: { columns: AstExpression[] } | AstExpression[] | null;
  having?: AstExpression | null;
  orderby?: AstExpression[] | null;
}

/**
 * Table reference in FROM clause
 * Can be a regular table, subquery, or table-valued function
 */
interface AstTableRef {
  table?: string;
  db?: string;
  as?: string;
  type?: string; // 'expr' for table-valued functions
  expr?: AstStatement | AstExpression; // Subquery or table-valued function
  on?: AstExpression;
}

/**
 * Detected function call with location context
 */
interface DetectedFunction {
  name: string;
  /** Approximate position for error reporting (keyword search fallback) */
  searchPattern: string;
}

/**
 * Check if limit clause is MySQL LIMIT syntax (not T-SQL OFFSET/FETCH)
 * OFFSET/FETCH is valid in MCE, but LIMIT is not
 */
function isMySqlLimitClause(limit: LimitClause): boolean {
  // T-SQL OFFSET/FETCH has 'offset' and/or 'fetch' properties
  // If either is present, this is valid T-SQL syntax, not MySQL LIMIT
  if (limit.offset !== undefined || limit.fetch !== undefined) {
    return false;
  }
  // MySQL LIMIT has 'value' array without offset/fetch
  return Array.isArray(limit.value) || typeof limit.seperator === "string";
}

/**
 * Extract function name from AST function node
 */
function extractFunctionName(func: AstFunction): string | null {
  if (typeof func.name === "string") {
    return func.name.toLowerCase();
  }
  // Complex name structure (schema.function)
  if (func.name && typeof func.name === "object" && "name" in func.name) {
    const nameArr = func.name.name;
    if (Array.isArray(nameArr) && nameArr.length > 0) {
      // Get the last part (function name without schema)
      const lastPart = nameArr[nameArr.length - 1];
      if (lastPart && typeof lastPart.value === "string") {
        return lastPart.value.toLowerCase();
      }
    }
  }
  return null;
}

/**
 * Recursively find all function calls in an expression
 */
function findFunctionsInExpression(
  expr: AstExpression | null | undefined,
  functions: DetectedFunction[],
): void {
  if (!expr) return;

  // Check if this node is a function call
  if (expr.type === "function" || expr.type === "aggr_func") {
    const funcNode = expr as unknown as AstFunction;
    const name = extractFunctionName(funcNode);
    if (name) {
      functions.push({
        name,
        searchPattern: `${name}(`,
      });
    }
    // Also check function arguments
    if (funcNode.args) {
      findFunctionsInArgs(funcNode.args, functions);
    }
    return;
  }

  // Recurse into binary expressions
  if (expr.left) findFunctionsInExpression(expr.left, functions);
  if (expr.right) findFunctionsInExpression(expr.right, functions);

  // Recurse into nested expressions
  if (expr.expr) {
    if (Array.isArray(expr.expr)) {
      for (const e of expr.expr) {
        findFunctionsInExpression(e, functions);
      }
    } else {
      findFunctionsInExpression(expr.expr, functions);
    }
  }

  // Recurse into args (for nested function calls)
  if (expr.args) {
    findFunctionsInArgs(expr.args, functions);
  }

  // Check for subqueries in value (e.g., IN clause: `value: [{ ast: {...} }]`)
  if (expr.value && Array.isArray(expr.value)) {
    for (const val of expr.value) {
      if (
        val &&
        typeof val === "object" &&
        "ast" in val &&
        (val as SubqueryValue).ast
      ) {
        findFunctionsInStatement((val as SubqueryValue).ast!, functions);
      }
    }
  }
}

/**
 * Helper to find functions in various args shapes
 */
function findFunctionsInArgs(
  args:
    | AstExpression
    | AstExpression[]
    | { expr?: AstExpression[]; type?: string; value?: unknown[] }
    | null,
  functions: DetectedFunction[],
): void {
  if (!args) return;

  if (Array.isArray(args)) {
    for (const arg of args) {
      findFunctionsInExpression(arg, functions);
    }
  } else if (typeof args === "object") {
    // Handle { expr: [...] } or { type: 'expr_list', value: [...] }
    if ("expr" in args && Array.isArray(args.expr)) {
      for (const arg of args.expr) {
        findFunctionsInExpression(arg, functions);
      }
    }
    if ("value" in args && Array.isArray(args.value)) {
      for (const arg of args.value) {
        if (arg && typeof arg === "object") {
          findFunctionsInExpression(arg as AstExpression, functions);
        }
      }
    }
    // If it's just an expression object
    if ("type" in args && typeof (args as AstExpression).type === "string") {
      findFunctionsInExpression(args as AstExpression, functions);
    }
  }
}

/**
 * Find all function calls in a statement (including subqueries)
 */
function findFunctionsInStatement(
  stmt: AstStatement,
  functions: DetectedFunction[],
): void {
  // Check SELECT columns
  if (stmt.columns && stmt.columns !== "*") {
    for (const col of stmt.columns) {
      findFunctionsInExpression(col.expr, functions);
    }
  }

  // Check WHERE clause
  findFunctionsInExpression(stmt.where, functions);

  // Check HAVING clause
  findFunctionsInExpression(stmt.having, functions);

  // Check ORDER BY
  if (stmt.orderby && Array.isArray(stmt.orderby)) {
    for (const orderExpr of stmt.orderby) {
      findFunctionsInExpression(orderExpr, functions);
    }
  }

  // Check GROUP BY
  if (stmt.groupby) {
    const groupExprs = Array.isArray(stmt.groupby)
      ? stmt.groupby
      : stmt.groupby.columns || [];
    for (const groupExpr of groupExprs) {
      findFunctionsInExpression(groupExpr, functions);
    }
  }

  // Check FROM clause for subqueries and table-valued functions
  if (stmt.from && Array.isArray(stmt.from)) {
    for (const tableRef of stmt.from) {
      // Table-valued function: { type: 'expr', expr: { type: 'function', ... } }
      if (tableRef.type === "expr" && tableRef.expr) {
        findFunctionsInExpression(tableRef.expr as AstExpression, functions);
      }
      // Subquery: { expr: { type: 'select', ... } }
      else if (tableRef.expr && typeof tableRef.expr === "object") {
        const exprObj = tableRef.expr as { type?: string };
        if (exprObj.type === "select") {
          findFunctionsInStatement(tableRef.expr as AstStatement, functions);
        }
      }
      // JOIN ON condition
      if (tableRef.on) {
        findFunctionsInExpression(tableRef.on, functions);
      }
    }
  }

  // Check CTE definitions (if any)
  if (stmt.with && Array.isArray(stmt.with)) {
    for (const cte of stmt.with) {
      const cteObj = cte as { stmt?: { ast?: AstStatement } };
      if (cteObj.stmt?.ast) {
        findFunctionsInStatement(cteObj.stmt.ast, functions);
      }
    }
  }
}

/**
 * Find the start position of a pattern in SQL (case-insensitive)
 * Returns the position or null if not found
 */
function findPatternPosition(sql: string, pattern: string): number | null {
  const lowerSql = sql.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  const index = lowerSql.indexOf(lowerPattern);
  return index >= 0 ? index : null;
}

/**
 * Find the start position of a keyword in SQL (case-insensitive)
 */
function findKeywordPosition(sql: string, keyword: string): number | null {
  return findPatternPosition(sql, keyword);
}

/**
 * Find the end position of a keyword in SQL
 */
function findKeywordEndPosition(sql: string, keyword: string): number | null {
  const pos = findKeywordPosition(sql, keyword);
  return pos !== null ? pos + keyword.length : null;
}

/**
 * Check for unsupported function usage
 */
function checkUnsupportedFunctions(
  statements: AstStatement[],
  sql: string,
): SqlDiagnostic[] {
  const diagnostics: SqlDiagnostic[] = [];
  const detectedFunctions: DetectedFunction[] = [];

  // Find all function calls in all statements
  for (const stmt of statements) {
    findFunctionsInStatement(stmt, detectedFunctions);
  }

  // Check each function against the unsupported list
  for (const func of detectedFunctions) {
    const alternative = MCE_SQL_UNSUPPORTED_FUNCTIONS.get(func.name);
    if (alternative !== undefined) {
      // Found an unsupported function
      const position = findPatternPosition(sql, func.searchPattern);
      const funcNameUpper = func.name.toUpperCase();

      const message = alternative
        ? `${funcNameUpper}() is not available in ${MC.SHORT}. ${alternative}`
        : `${funcNameUpper}() is not available in ${MC.SHORT}. There is no direct equivalent.`;

      diagnostics.push({
        message,
        severity: "error",
        startIndex: position ?? 0,
        endIndex: position !== null ? position + func.name.length : sql.length,
      });
    }
  }

  return diagnostics;
}

/**
 * Escape special regex characters in a string
 */
const escapeRegex = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Token-based fallback detection for unsupported functions that may cause parse errors.
 * This handles functions like TRY_CAST, STRING_SPLIT, OPENJSON which node-sql-parser
 * may not recognize in the T-SQL dialect.
 */
export function checkUnsupportedFunctionsViaTokens(
  sql: string,
): SqlDiagnostic[] {
  const diagnostics: SqlDiagnostic[] = [];

  // Check for each unsupported function using regex to match function call pattern
  for (const [funcName, alternative] of MCE_SQL_UNSUPPORTED_FUNCTIONS) {
    // Match function name followed by opening parenthesis, allowing whitespace
    const escapedFuncName = escapeRegex(funcName);
    // eslint-disable-next-line security/detect-non-literal-regexp -- funcName from MCE_SQL_UNSUPPORTED_FUNCTIONS Map keys, not user input
    const pattern = new RegExp(`\\b${escapedFuncName}\\s*\\(`, "gi");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(sql)) !== null) {
      const position = match.index;
      const funcNameUpper = funcName.toUpperCase();

      const message = alternative
        ? `${funcNameUpper}() is not available in ${MC.SHORT}. ${alternative}`
        : `${funcNameUpper}() is not available in ${MC.SHORT}. There is no direct equivalent.`;

      diagnostics.push({
        message,
        severity: "error",
        startIndex: position,
        endIndex: position + funcName.length,
      });
    }
  }

  return diagnostics;
}

/**
 * Check for policy violations in the AST
 *
 * @param statements - Normalized array of AST statements
 * @param sql - Original SQL string (for position calculation)
 * @returns Array of policy violation diagnostics
 */
export function checkPolicyViolations(
  statements: AstStatement[],
  sql: string,
): SqlDiagnostic[] {
  const diagnostics: SqlDiagnostic[] = [];

  for (const stmt of statements) {
    // Check statement type
    const stmtType = stmt.type?.toLowerCase();

    // Prohibited statement types (INSERT, UPDATE, DELETE, etc.)
    if (stmtType && Object.hasOwn(PROHIBITED_STATEMENT_TYPES, stmtType)) {
      diagnostics.push({
        message: PROHIBITED_STATEMENT_TYPES[stmtType],
        severity: "error",
        startIndex: 0,
        endIndex: sql.length,
      });
      // Don't check further if statement type is prohibited
      continue;
    }

    // Unknown/unsupported statement type
    if (stmtType && !ALLOWED_STATEMENT_TYPES.has(stmtType)) {
      diagnostics.push({
        message: `${stmtType.toUpperCase()} statements are not supported in ${MC.SHORT}.`,
        severity: "error",
        startIndex: 0,
        endIndex: sql.length,
      });
      continue;
    }

    // Check for CTE (WITH clause)
    if (stmt.with && Array.isArray(stmt.with) && stmt.with.length > 0) {
      diagnostics.push({
        message: `Common Table Expressions (WITH clause) are not supported in ${MC.SHORT}. Use subqueries instead.`,
        severity: "error",
        startIndex: 0,
        endIndex: findKeywordEndPosition(sql, "WITH") ?? sql.length,
      });
    }

    // Check for MySQL LIMIT clause (not T-SQL OFFSET/FETCH)
    // OFFSET/FETCH is valid in MCE, but LIMIT is not
    if (stmt.limit && isMySqlLimitClause(stmt.limit)) {
      const limitPos = findKeywordPosition(sql, "LIMIT");
      diagnostics.push({
        message: `LIMIT clause is not supported in ${MC.SHORT}. Use TOP or OFFSET/FETCH instead.`,
        severity: "error",
        startIndex: limitPos ?? 0,
        endIndex: sql.length,
      });
    }
  }

  // Check for unsupported functions (across all statements)
  const functionDiagnostics = checkUnsupportedFunctions(statements, sql);
  diagnostics.push(...functionDiagnostics);

  return diagnostics;
}
