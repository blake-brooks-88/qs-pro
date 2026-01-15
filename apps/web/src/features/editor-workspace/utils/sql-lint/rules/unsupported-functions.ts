import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";
import { MCE_SQL_UNSUPPORTED_FUNCTIONS } from "@/constants/mce-sql";

const getUnsupportedFunctionDiagnostics = (sql: string): SqlDiagnostic[] => {
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

    if (inBracket) {
      if (char === "]") {
        inBracket = false;
      }
      index += 1;
      continue;
    }

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

    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      let checkIndex = end;
      while (checkIndex < sql.length && /\s/.test(sql.charAt(checkIndex))) {
        checkIndex += 1;
      }

      if (checkIndex < sql.length && sql.charAt(checkIndex) === "(") {
        const alternative = MCE_SQL_UNSUPPORTED_FUNCTIONS.get(word);
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

export const unsupportedFunctionsRule: LintRule = {
  id: "unsupported-functions",
  name: "Unsupported Functions",
  check: (context: LintContext) => {
    return getUnsupportedFunctionDiagnostics(context.sql);
  },
};
