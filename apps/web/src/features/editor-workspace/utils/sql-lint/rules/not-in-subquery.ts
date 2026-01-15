import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

const getNotInSubqueryDiagnostics = (sql: string): SqlDiagnostic[] => {
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

      if (word === "not") {
        // Skip whitespace after NOT
        let pos = end;
        while (pos < sql.length && /\s/.test(sql.charAt(pos))) {
          pos += 1;
        }

        // Check if followed by IN
        if (pos < sql.length && isWordChar(sql.charAt(pos))) {
          const inWordStart = pos;
          let inWordEnd = pos + 1;
          while (inWordEnd < sql.length && isWordChar(sql.charAt(inWordEnd))) {
            inWordEnd += 1;
          }
          const inWord = sql.slice(inWordStart, inWordEnd).toLowerCase();

          if (inWord === "in") {
            // Skip whitespace after IN
            let parenPos = inWordEnd;
            while (parenPos < sql.length && /\s/.test(sql.charAt(parenPos))) {
              parenPos += 1;
            }

            // Check if followed by (
            if (parenPos < sql.length && sql.charAt(parenPos) === "(") {
              // Skip whitespace and check for SELECT keyword
              let selectPos = parenPos + 1;
              while (
                selectPos < sql.length &&
                /\s/.test(sql.charAt(selectPos))
              ) {
                selectPos += 1;
              }

              // Check if it's a SELECT subquery
              if (selectPos < sql.length && isWordChar(sql.charAt(selectPos))) {
                const selectWordStart = selectPos;
                let selectWordEnd = selectPos + 1;
                while (
                  selectWordEnd < sql.length &&
                  isWordChar(sql.charAt(selectWordEnd))
                ) {
                  selectWordEnd += 1;
                }
                const selectWord = sql
                  .slice(selectWordStart, selectWordEnd)
                  .toLowerCase();

                if (selectWord === "select") {
                  diagnostics.push(
                    createDiagnostic(
                      "NOT IN with subquery may return no results if subquery contains NULL values. Consider using NOT EXISTS instead.",
                      "warning",
                      start,
                      inWordEnd,
                    ),
                  );
                }
              }
            }
          }
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
 * Rule to warn about NOT IN with subqueries.
 * NOT IN returns no results if the subquery contains NULL values.
 * NOT EXISTS is a safer alternative.
 */
export const notInSubqueryRule: LintRule = {
  id: "not-in-subquery",
  name: "NOT IN Subquery Warning",
  check: (context: LintContext) => {
    return getNotInSubqueryDiagnostics(context.sql);
  },
};
