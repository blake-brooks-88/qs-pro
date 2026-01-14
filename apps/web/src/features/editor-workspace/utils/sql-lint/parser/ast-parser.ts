/**
 * AST Parser for MCE SQL
 *
 * This module wraps node-sql-parser and provides MCE-specific diagnostics
 * from AST analysis. It handles:
 *
 * 1. Syntax errors (parse failures with location info)
 * 2. Policy violations (prohibited statements, CTEs, LIMIT, unsupported functions)
 * 3. Reserved for future: semantic analysis
 */

import { Parser } from "node-sql-parser";
import type { SqlDiagnostic } from "../types";
import {
  checkPolicyViolations,
  checkUnsupportedFunctionsViaTokens,
  type AstStatement,
} from "./policy";

// Create parser instance - use T-SQL / SQL Server dialect
const parser = new Parser();
const DIALECT = "transactsql";

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
 * Attempt to parse SQL and return structured result
 */
function tryParse(sql: string): ParseResult {
  try {
    const ast = parser.astify(sql, { database: DIALECT });
    // Use unknown first to safely cast from node-sql-parser's AST type
    return {
      success: true,
      ast: ast as unknown as AstStatement | AstStatement[],
    };
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
    // Parse failed - first check if it's due to unsupported functions
    // Some functions like TRY_CAST, STRING_SPLIT, OPENJSON cause parse errors
    // in node-sql-parser because they're not in its grammar
    const tokenBasedFunctionErrors = checkUnsupportedFunctionsViaTokens(sql);

    if (tokenBasedFunctionErrors.length > 0) {
      // Found unsupported functions - return those errors instead of generic parse error
      // This provides better UX by explaining WHY the parse failed
      return tokenBasedFunctionErrors;
    }

    // No known unsupported functions - return the parse error
    const error = result.error!;
    const startIndex = error.location?.start?.offset ?? 0;
    const endIndex = error.location?.end?.offset ?? startIndex + 1;

    diagnostics.push({
      message: formatParseError(error.message),
      severity: "error",
      startIndex,
      endIndex: Math.max(endIndex, startIndex + 1),
    });

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
