import { SQL_KEYWORDS } from "./keywords";
import { tokenizeSql } from "./tokenize-sql";

export function isAtEndOfBracketedTableInFromJoin(
  sql: string,
  cursorIndex: number,
): boolean {
  let openBracketIndex = -1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let bracketDepth = 0;

  for (let i = cursorIndex - 1; i >= 0; i--) {
    const char = sql.charAt(i);
    const prevChar = i > 0 ? sql.charAt(i - 1) : "";

    if (char === "'" && prevChar !== "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "]") {
      bracketDepth++;
    } else if (char === "[") {
      if (bracketDepth > 0) {
        bracketDepth--;
      } else {
        openBracketIndex = i;
        break;
      }
    }
  }

  if (openBracketIndex === -1) {
    return false;
  }

  const bracketContent = sql.slice(openBracketIndex + 1, cursorIndex).trim();
  if (bracketContent.length === 0) {
    return false;
  }

  const textBeforeBracket = sql.slice(0, openBracketIndex);
  const tokens = tokenizeSql(textBeforeBracket);

  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens.at(i);
    if (!token) {
      continue;
    }
    if (token.type !== "word") {
      continue;
    }
    const value = token.value.toLowerCase();

    if (value === "from" || value === "join") {
      return true;
    }

    if (SQL_KEYWORDS.has(value)) {
      return false;
    }
  }

  return false;
}
