import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";
import {
  MCE_SQL_PROHIBITED_DML,
  MCE_SQL_PROHIBITED_DDL,
  MCE_SQL_PROHIBITED_PROCEDURAL,
} from "@/constants/mce-sql";

const getKeywordDiagnostics = (sql: string): SqlDiagnostic[] => {
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

    if (char === "#") {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      if (end > start + 1) {
        diagnostics.push(
          createDiagnostic(
            `Temp tables (#table) are not supported in ${MC.SHORT}. Use a subquery instead. Example: \`SELECT * FROM (SELECT ... ) AS temp\`.`,
            "error",
            start,
            end,
          ),
        );
      }
      index = end;
      continue;
    }

    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      if (MCE_SQL_PROHIBITED_DML.has(word)) {
        diagnostics.push(
          createDiagnostic(
            `${MC.SHORT} SQL is read-only — INSERT, UPDATE, DELETE are not supported. To modify data, use the Query Activity's 'Overwrite' or 'Update' data action, or the ${MC.SHORT} UI.`,
            "error",
            start,
            end,
          ),
        );
      } else if (MCE_SQL_PROHIBITED_PROCEDURAL.has(word)) {
        diagnostics.push(
          createDiagnostic(
            `Variables and procedural logic (DECLARE, SET, WHILE, IF) are not supported in ${MC.SHORT}. Write pure SELECT queries only.`,
            "error",
            start,
            end,
          ),
        );
      } else if (MCE_SQL_PROHIBITED_DDL.has(word)) {
        diagnostics.push(
          createDiagnostic(
            `${MC.SHORT} SQL is read-only — DDL statements (CREATE, DROP, ALTER) are not supported.`,
            "error",
            start,
            end,
          ),
        );
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return diagnostics;
};

export const prohibitedKeywordsRule: LintRule = {
  id: "prohibited-keywords",
  name: "Prohibited Keywords",
  check: (context: LintContext) => {
    return getKeywordDiagnostics(context.sql);
  },
};
