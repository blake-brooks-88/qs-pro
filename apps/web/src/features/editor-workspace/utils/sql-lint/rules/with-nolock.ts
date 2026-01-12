import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";
import { MC } from "@/constants/marketing-cloud";

const getWithNolockDiagnostics = (sql: string): SqlDiagnostic[] => {
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
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      if (word === "with") {
        // Skip whitespace after WITH
        let pos = end;
        while (pos < sql.length && /\s/.test(sql[pos])) {
          pos += 1;
        }

        // Check if followed by (NOLOCK) or ( NOLOCK )
        if (pos < sql.length && sql[pos] === "(") {
          let innerPos = pos + 1;
          // Skip whitespace inside parentheses
          while (innerPos < sql.length && /\s/.test(sql[innerPos])) {
            innerPos += 1;
          }

          // Check for NOLOCK
          if (innerPos < sql.length && isWordChar(sql[innerPos])) {
            const wordStart = innerPos;
            let wordEnd = innerPos + 1;
            while (wordEnd < sql.length && isWordChar(sql[wordEnd])) {
              wordEnd += 1;
            }
            const innerWord = sql.slice(wordStart, wordEnd).toLowerCase();

            if (innerWord === "nolock") {
              // Skip whitespace after NOLOCK
              let closePos = wordEnd;
              while (closePos < sql.length && /\s/.test(sql[closePos])) {
                closePos += 1;
              }

              // Check for closing parenthesis
              if (closePos < sql.length && sql[closePos] === ")") {
                diagnostics.push(
                  createDiagnostic(
                    `WITH (NOLOCK) is redundant in ${MC.SHORT}. All queries already run in read-uncommitted isolation, so this hint has no effect. Consider removing it.`,
                    "warning",
                    start,
                    closePos + 1,
                  ),
                );
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
 * Rule to warn about WITH (NOLOCK) usage.
 * This hint is redundant in MCE as queries already run in isolation.
 */
export const withNolockRule: LintRule = {
  id: "with-nolock",
  name: "WITH (NOLOCK) Warning",
  check: (context: LintContext) => {
    return getWithNolockDiagnostics(context.sql);
  },
};
