export type SqlTokenType = "word" | "bracket" | "symbol";

export interface SqlToken {
  type: SqlTokenType;
  value: string;
  startIndex: number;
  endIndex: number;
  depth: number;
}

const isWordChar = (value: string) => /[A-Za-z0-9_]/.test(value);

const isWhitespace = (value: string) => /\s/.test(value);

const scanUntil = (sql: string, startIndex: number, endChar: string) => {
  let index = startIndex;
  while (index < sql.length) {
    const char = sql.charAt(index);
    if (char === endChar) {
      return index;
    }
    index += 1;
  }
  return sql.length;
};

export const tokenizeSql = (sql: string): SqlToken[] => {
  const tokens: SqlToken[] = [];
  let index = 0;
  let depth = 0;
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
      const endIndex = scanUntil(sql, index + 1, "]");
      const value = sql.slice(index + 1, endIndex);
      tokens.push({
        type: "bracket",
        value,
        startIndex: index,
        endIndex: Math.min(endIndex + 1, sql.length),
        depth,
      });
      index = Math.min(endIndex + 1, sql.length);
      continue;
    }

    if (char === "(") {
      tokens.push({
        type: "symbol",
        value: char,
        startIndex: index,
        endIndex: index + 1,
        depth,
      });
      depth += 1;
      index += 1;
      continue;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
      tokens.push({
        type: "symbol",
        value: char,
        startIndex: index,
        endIndex: index + 1,
        depth,
      });
      index += 1;
      continue;
    }

    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === "," || char === ".") {
      tokens.push({
        type: "symbol",
        value: char,
        startIndex: index,
        endIndex: index + 1,
        depth,
      });
      index += 1;
      continue;
    }

    if (isWordChar(char)) {
      const start = index;
      let end = index + 1;
      while (end < sql.length && isWordChar(sql.charAt(end))) {
        end += 1;
      }
      tokens.push({
        type: "word",
        value: sql.slice(start, end),
        startIndex: start,
        endIndex: end,
        depth,
      });
      index = end;
      continue;
    }

    index += 1;
  }

  return tokens;
};
