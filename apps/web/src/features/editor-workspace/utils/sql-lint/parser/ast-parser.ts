/**
 * AST Parser for MCE SQL
 *
 * This module wraps node-sql-parser and provides MCE-specific diagnostics
 * from AST analysis. It handles:
 *
 * 1. Syntax errors (parse failures with location info)
 * 2. Policy violations (prohibited statements, CTEs, LIMIT)
 * 3. Reserved for future: semantic analysis
 */

import { Parser } from "node-sql-parser";
import type { SqlDiagnostic } from "../types";

// Create parser instance - use T-SQL / SQL Server dialect
const parser = new Parser();
const DIALECT = "transactsql";

// Statement types that are allowed in MCE Query Studio
const ALLOWED_STATEMENT_TYPES = new Set(["select"]);

// Statement types that are explicitly prohibited
const PROHIBITED_STATEMENT_TYPES: Record<string, string> = {
  insert: "INSERT statements are not allowed in MCE Query Studio.",
  update: "UPDATE statements are not allowed in MCE Query Studio.",
  delete: "DELETE statements are not allowed in MCE Query Studio.",
  create: "CREATE statements are not allowed in MCE Query Studio.",
  alter: "ALTER statements are not allowed in MCE Query Studio.",
  drop: "DROP statements are not allowed in MCE Query Studio.",
  truncate: "TRUNCATE statements are not allowed in MCE Query Studio.",
};

/**
 * Result of parsing SQL with node-sql-parser
 */
interface ParseResult {
  success: boolean;
  ast?: AstStatement | AstStatement[];
  error?: {
    message: string;
    location?: {
      start: { offset: number; line: number; column: number };
      end: { offset: number; line: number; column: number };
    };
  };
}

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
 * Basic shape of an AST statement from node-sql-parser.
 * This is a minimal interface covering the properties we need for MCE policy checks.
 */
interface AstStatement {
  type: string;
  with?: unknown[] | null;
  limit?: LimitClause | null;
  from?: unknown[] | null;
}

/**
 * Attempt to parse SQL and return structured result
 */
function tryParse(sql: string): ParseResult {
  try {
    const ast = parser.astify(sql, { database: DIALECT });
    // Use unknown first to safely cast from node-sql-parser's AST type
    return { success: true, ast: ast as unknown as AstStatement | AstStatement[] };
  } catch (err) {
    const error = err as Error & {
      location?: {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      };
    };
    return {
      success: false,
      error: {
        message: error.message,
        location: error.location,
      },
    };
  }
}

/**
 * Normalize AST to array format (single statement returns object, multiple returns array)
 */
function normalizeAst(ast: AstStatement | AstStatement[]): AstStatement[] {
  return Array.isArray(ast) ? ast : [ast];
}

/**
 * Create a user-friendly error message from parser error
 */
function formatParseError(errorMessage: string): string {
  // The parser error messages are verbose - simplify common patterns
  if (errorMessage.includes("but end of input found")) {
    return "Unexpected end of query. Check for missing clauses or incomplete syntax.";
  }

  // Extract the "found X" part for a simpler message
  const foundMatch = errorMessage.match(/but "(.+)" found/);
  if (foundMatch) {
    const found = foundMatch[1];
    if (found === ",") {
      return "Unexpected comma. Check for missing column name or expression.";
    }
    if (found === ")") {
      return "Unexpected closing parenthesis. Check for unmatched parentheses.";
    }
    if (found === "(") {
      return "Unexpected opening parenthesis. Check for missing keyword or expression.";
    }
    return `Unexpected "${found}". Check the syntax near this position.`;
  }

  // For other errors, truncate if too long
  if (errorMessage.length > 150) {
    return "Syntax error in query. Check for missing or misplaced keywords.";
  }

  return errorMessage;
}

/**
 * Check if limit clause is MySQL LIMIT syntax (not T-SQL OFFSET/FETCH)
 */
function isMySqlLimitClause(limit: LimitClause): boolean {
  // MySQL LIMIT has 'value' array, T-SQL OFFSET/FETCH has 'offset'/'fetch'
  return (
    Array.isArray(limit.value) ||
    (typeof limit.seperator === "string" && !limit.offset && !limit.fetch)
  );
}

/**
 * Check for policy violations in the AST
 */
function checkPolicyViolations(
  statements: AstStatement[],
  sql: string,
): SqlDiagnostic[] {
  const diagnostics: SqlDiagnostic[] = [];

  for (const stmt of statements) {
    // Check statement type
    const stmtType = stmt.type?.toLowerCase();

    // Prohibited statement types (INSERT, UPDATE, DELETE, etc.)
    if (stmtType && PROHIBITED_STATEMENT_TYPES[stmtType]) {
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
        message: `${stmtType.toUpperCase()} statements are not supported in MCE Query Studio.`,
        severity: "error",
        startIndex: 0,
        endIndex: sql.length,
      });
      continue;
    }

    // Check for CTE (WITH clause)
    if (stmt.with && Array.isArray(stmt.with) && stmt.with.length > 0) {
      diagnostics.push({
        message:
          "Common Table Expressions (WITH clause) are not supported in MCE Query Studio.",
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
        message:
          "LIMIT clause is not supported in MCE. Use TOP or OFFSET/FETCH instead.",
        severity: "error",
        startIndex: limitPos ?? 0,
        endIndex: sql.length,
      });
    }
  }

  return diagnostics;
}

/**
 * Find the start position of a keyword in SQL (case-insensitive, not in strings)
 */
function findKeywordPosition(sql: string, keyword: string): number | null {
  const upperSql = sql.toUpperCase();
  const upperKeyword = keyword.toUpperCase();
  const index = upperSql.indexOf(upperKeyword);
  // TODO: More sophisticated check to ensure not in string literal
  return index >= 0 ? index : null;
}

/**
 * Find the end position of a keyword in SQL
 */
function findKeywordEndPosition(sql: string, keyword: string): number | null {
  const pos = findKeywordPosition(sql, keyword);
  return pos !== null ? pos + keyword.length : null;
}

/**
 * Parse SQL and return diagnostics from AST analysis.
 *
 * This is the main entry point for the AST-based linter.
 */
export function parseAndLint(sql: string): SqlDiagnostic[] {
  // Empty SQL should be handled by prereq rules, not parser
  if (!sql.trim()) {
    return [];
  }

  const diagnostics: SqlDiagnostic[] = [];
  const result = tryParse(sql);

  if (!result.success) {
    // Parse failed - create syntax error diagnostic
    const error = result.error!;
    const startIndex = error.location?.start?.offset ?? 0;
    const endIndex = error.location?.end?.offset ?? startIndex + 1;

    diagnostics.push({
      message: formatParseError(error.message),
      severity: "error",
      startIndex,
      endIndex: Math.max(endIndex, startIndex + 1),
    });

    // Can't do policy checks on failed parse
    return diagnostics;
  }

  // Parse succeeded - check policy violations
  const statements = normalizeAst(result.ast!);
  const policyDiagnostics = checkPolicyViolations(statements, sql);
  diagnostics.push(...policyDiagnostics);

  return diagnostics;
}

/**
 * Check if the SQL can be parsed (for quick validation)
 */
export function canParse(sql: string): boolean {
  if (!sql.trim()) return true;
  const result = tryParse(sql);
  return result.success;
}

/**
 * Get the AST for SQL (for debugging/exploration)
 */
export function getAst(sql: string): unknown {
  const result = tryParse(sql);
  return result.success ? result.ast : null;
}
