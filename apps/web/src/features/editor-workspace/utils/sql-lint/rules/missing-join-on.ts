import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic, isWordChar } from "../utils/helpers";

/**
 * Detects JOIN clauses without ON condition (except CROSS JOIN).
 * INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL JOIN all require ON.
 * CROSS JOIN does not require ON.
 */
const getMissingJoinOnDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let inLineComment = false;
  let inBlockComment = false;

  // Track JOIN keywords and check for ON
  const joinPositions: Array<{
    joinType: string;
    start: number;
    end: number;
    isCross: boolean;
  }> = [];

  while (index < sql.length) {
    const char = sql[index];
    const nextChar = sql[index + 1];

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

    // Handle single quotes
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

    // Handle double quotes
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

    // Start line comment
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      index += 2;
      continue;
    }

    // Start block comment
    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      index += 2;
      continue;
    }

    // Start single quote
    if (char === "'") {
      inSingleQuote = true;
      index += 1;
      continue;
    }

    // Start double quote
    if (char === '"') {
      inDoubleQuote = true;
      index += 1;
      continue;
    }

    // Start bracket
    if (char === "[") {
      inBracket = true;
      index += 1;
      continue;
    }

    // Check for keywords when we see word characters
    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql[end])) {
        end += 1;
      }
      const word = sql.slice(start, end).toLowerCase();

      // Check for JOIN keywords
      if (
        word === "join" ||
        word === "inner" ||
        word === "left" ||
        word === "right" ||
        word === "full" ||
        word === "cross"
      ) {
        // Look ahead to determine the full join type
        let lookAhead = end;
        const joinWords: string[] = [word];
        let finalEnd = end;

        while (lookAhead < sql.length) {
          // Skip whitespace
          while (lookAhead < sql.length && /\s/.test(sql[lookAhead])) {
            lookAhead += 1;
          }

          if (lookAhead >= sql.length || !isWordChar(sql[lookAhead])) break;

          // Read next word
          const wordStart = lookAhead;
          let wordEnd = lookAhead + 1;
          while (wordEnd < sql.length && isWordChar(sql[wordEnd])) {
            wordEnd += 1;
          }
          const nextWord = sql.slice(wordStart, wordEnd).toLowerCase();

          // Check if this is part of the join type
          if (
            nextWord === "join" ||
            nextWord === "outer" ||
            (joinWords.includes("inner") && nextWord === "join") ||
            (joinWords.includes("left") &&
              (nextWord === "outer" || nextWord === "join")) ||
            (joinWords.includes("right") &&
              (nextWord === "outer" || nextWord === "join")) ||
            (joinWords.includes("full") &&
              (nextWord === "outer" || nextWord === "join")) ||
            (joinWords.includes("cross") && nextWord === "join")
          ) {
            joinWords.push(nextWord);
            finalEnd = wordEnd;
            lookAhead = wordEnd;
            if (nextWord === "join") break; // End of join type
          } else {
            break;
          }
        }

        // Check if this is a complete JOIN clause
        if (joinWords.includes("join")) {
          const joinType = joinWords.join(" ");
          const isCross = joinWords.includes("cross");

          joinPositions.push({
            joinType,
            start,
            end: finalEnd,
            isCross,
          });
        }
      }

      index = end;
      continue;
    }

    index += 1;
  }

  // Now check each JOIN to see if it has an ON clause
  for (let i = 0; i < joinPositions.length; i++) {
    const join = joinPositions[i];

    // CROSS JOIN doesn't require ON
    if (join.isCross) continue;

    // Look for ON keyword after the JOIN
    // We need to find the next table reference and then check for ON
    const searchIndex = join.end;
    let foundOn = false;
    let foundNextJoin = false;
    let foundClauseEnd = false;

    // Reset quote/comment tracking
    let checkIndex = searchIndex;
    inSingleQuote = false;
    inDoubleQuote = false;
    inBracket = false;
    inLineComment = false;
    inBlockComment = false;

    while (
      checkIndex < sql.length &&
      !foundOn &&
      !foundNextJoin &&
      !foundClauseEnd
    ) {
      const char = sql[checkIndex];
      const nextChar = sql[checkIndex + 1];

      // Handle comments and quotes
      if (inLineComment) {
        if (char === "\n") inLineComment = false;
        checkIndex += 1;
        continue;
      }
      if (inBlockComment) {
        if (char === "*" && nextChar === "/") {
          inBlockComment = false;
          checkIndex += 2;
          continue;
        }
        checkIndex += 1;
        continue;
      }
      if (inSingleQuote) {
        if (char === "'") {
          if (nextChar === "'") {
            checkIndex += 2;
            continue;
          }
          inSingleQuote = false;
        }
        checkIndex += 1;
        continue;
      }
      if (inDoubleQuote) {
        if (char === '"') inDoubleQuote = false;
        checkIndex += 1;
        continue;
      }
      if (inBracket) {
        if (char === "]") inBracket = false;
        checkIndex += 1;
        continue;
      }
      if (char === "-" && nextChar === "-") {
        inLineComment = true;
        checkIndex += 2;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        inBlockComment = true;
        checkIndex += 2;
        continue;
      }
      if (char === "'") {
        inSingleQuote = true;
        checkIndex += 1;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = true;
        checkIndex += 1;
        continue;
      }
      if (char === "[") {
        inBracket = true;
        checkIndex += 1;
        continue;
      }

      // Check for keywords
      if (isWordChar(char)) {
        const wordStart = checkIndex;
        let wordEnd = checkIndex + 1;
        while (wordEnd < sql.length && isWordChar(sql[wordEnd])) {
          wordEnd += 1;
        }
        const word = sql.slice(wordStart, wordEnd).toLowerCase();

        if (word === "on") {
          foundOn = true;
        } else if (
          word === "join" ||
          word === "inner" ||
          word === "left" ||
          word === "right" ||
          word === "full" ||
          word === "cross"
        ) {
          foundNextJoin = true;
        } else if (
          word === "where" ||
          word === "group" ||
          word === "having" ||
          word === "order" ||
          word === "union" ||
          word === "except" ||
          word === "intersect"
        ) {
          foundClauseEnd = true;
        }

        checkIndex = wordEnd;
        continue;
      }

      checkIndex += 1;
    }

    // If we didn't find ON before the next JOIN or clause end, report error
    if (!foundOn) {
      diagnostics.push(
        createDiagnostic(
          `${join.joinType.toUpperCase()} requires an ON clause. Example: \`${join.joinType.toUpperCase()} [Table] t ON t.ID = base.ID\`. Only CROSS JOIN can omit ON.`,
          "error",
          join.start,
          join.end,
        ),
      );
    }
  }

  return diagnostics;
};

/**
 * Rule to detect JOIN clauses without ON condition (except CROSS JOIN).
 * INNER JOIN, LEFT JOIN, RIGHT JOIN, FULL JOIN all require ON.
 */
export const missingJoinOnRule: LintRule = {
  id: "missing-join-on",
  name: "Missing JOIN ON Clause",
  check: (context: LintContext) => {
    return getMissingJoinOnDiagnostics(context.sql);
  },
};
