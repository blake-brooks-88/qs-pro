import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

const getVariableUsageDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < sql.length) {
    const char = sql.charAt(index);
    const nextChar = sql.charAt(index + 1);

    // Handle line comments
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index += 1;
      continue;
    }

    // Handle block comments
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    // Handle single-quoted strings
    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          index += 2;
          continue;
        }
        inSingleQuote = false;
      }
      index += 1;
      continue;
    }

    // Handle double-quoted identifiers
    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    // Handle bracketed identifiers
    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

    // Start of line comment
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    // Start of block comment
    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Start of single-quoted string
    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    // Start of double-quoted identifier
    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Start of bracketed identifier
    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Check for @ symbol (variable marker)
    if (char === "@") {
      const start = index;
      let end = index + 1;

      // Check if it's a variable (@ followed by word characters)
      if (end < sql.length && isWordChar(sql.charAt(end))) {
        // Consume the variable name
        while (end < sql.length && isWordChar(sql.charAt(end))) {
          end += 1;
        }

        const variableName = sql.slice(start, end);
        diagnostics.push(
          createDiagnostic(
            `SQL variables are not supported in ${MC.SHORT}. Remove the variable '${variableName}' or replace it with a literal value.`,
            "error",
            start,
            end,
          ),
        );

        index = end;
        continue;
      }
    }

    index += 1;
  }

  return diagnostics;
};

/**
 * Rule to detect SQL variable usage in MCE SQL.
 * MCE does not support variables like @variableName.
 */
export const variableUsageRule: LintRule = {
  id: "variable-usage",
  name: "Variable Usage",
  check: (context: LintContext) => {
    return getVariableUsageDiagnostics(context.sql);
  },
};
