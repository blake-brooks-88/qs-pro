const SQL_KEYWORDS_FOR_PARENS = new Set([
  "select",
  "from",
  "join",
  "where",
  "group",
  "order",
  "having",
  "union",
  "intersect",
  "except",
  "when",
  "then",
  "case",
  "and",
  "or",
  "not",
  "in",
  "exists",
]);

export function isInsideString(sql: string, cursorIndex: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i += 1;
          continue;
        }
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  return inSingleQuote || inDoubleQuote;
}

export function isInsideComment(sql: string, cursorIndex: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i += 1;
          continue;
        }
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  return inLineComment || inBlockComment;
}

export function isInsideBrackets(sql: string, cursorIndex: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let bracketDepth = 0;

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i += 1;
          continue;
        }
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "[") {
      bracketDepth += 1;
      inBracket = true;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      if (bracketDepth === 0) {
        inBracket = false;
      }
    }

    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  return inBracket;
}

export function isAfterComparisonOperator(
  sql: string,
  cursorIndex: number,
): boolean {
  const textBefore = sql.slice(0, cursorIndex).trimEnd();
  if (textBefore.length === 0) {
    return false;
  }

  if (textBefore.length >= 2) {
    const lastTwo = textBefore.slice(-2);
    if (["!=", "<>", "<=", ">="].includes(lastTwo)) {
      return true;
    }
  }

  const lastChar = textBefore.charAt(textBefore.length - 1);
  return ["=", "<", ">"].includes(lastChar);
}

export function isInsideFunctionParens(
  sql: string,
  cursorIndex: number,
): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  const parenStack: Array<{ isFunction: boolean }> = [];

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i += 1;
          continue;
        }
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "(") {
      let wordStart = -1;
      let wordEnd = -1;

      for (let j = i - 1; j >= 0; j--) {
        if (!/\s/.test(sql.charAt(j))) {
          wordEnd = j + 1;
          break;
        }
      }

      if (wordEnd !== -1) {
        for (let j = wordEnd - 1; j >= 0; j--) {
          if (!/[A-Za-z0-9_]/.test(sql.charAt(j))) {
            wordStart = j + 1;
            break;
          }
          if (j === 0) {
            wordStart = 0;
          }
        }
      }

      let isFunction = false;
      if (wordStart !== -1 && wordEnd !== -1) {
        const wordBefore = sql.slice(wordStart, wordEnd).toLowerCase();
        isFunction =
          wordBefore.length > 0 && !SQL_KEYWORDS_FOR_PARENS.has(wordBefore);
      }

      parenStack.push({ isFunction });
    } else if (char === ")") {
      parenStack.pop();
    }

    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  return parenStack.some((p) => p.isFunction);
}
