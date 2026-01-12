import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

/**
 * List of functions that may not be supported in Marketing Cloud SQL.
 * Note: json_value and json_query ARE supported (SQL Server 2016).
 */
const UNSUPPORTED_FUNCTIONS: Record<string, string | null> = {
  string_agg: null,
  string_split: null,
  json_modify: null,
  openjson: null,
  isjson: null,
  try_convert: "Use CONVERT() instead",
  try_cast: "Use CAST() instead",
  try_parse: null,
};

const getUnsupportedFunctionDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

    // Handle comments
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    // Handle strings
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

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      index += 1;
      continue;
    }

    // Handle brackets
    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

    // Start of comment
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Start of string
    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Start of bracket
    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Check for function names
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      // Skip whitespace after word
      let checkIndex = end;
      while (checkIndex < sql.length && /\s/.test(sql[checkIndex])) {
        checkIndex += 1;
      }

      // Check if followed by opening parenthesis (indicates function call)
      if (checkIndex < sql.length && sql[checkIndex] === "(") {
        const alternative = UNSUPPORTED_FUNCTIONS[word];
        if (alternative !== undefined) {
          const message = alternative
            ? `${word.toUpperCase()}() is not available in ${MC.SHORT}. ${alternative}`
            : `${word.toUpperCase()}() is not available in ${MC.SHORT}. There is no direct equivalent.`;
          diagnostics.push(createDiagnostic(message, "error", start, end));
        }
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return diagnostics;
};

/**
 * Rule to detect potentially unsupported functions in Marketing Cloud SQL.
 */
export const unsupportedFunctionsRule: LintRule = {
  id: "unsupported-functions",
  name: "Unsupported Functions",
  check: (context: LintContext) => {
    return getUnsupportedFunctionDiagnostics(context.sql);
  },
};
