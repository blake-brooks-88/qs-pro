import { SQL_KEYWORDS } from "./keywords";
import type { SqlTableReference } from "./table-references";
import { extractTableReferences } from "./table-references";
import type { SqlToken } from "./tokenize-sql";
import { tokenizeSql } from "./tokenize-sql";

const getCursorDepth = (sql: string, cursorIndex: number) => {
  let depth = 0;
  let index = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;

  while (index < cursorIndex) {
    const char = sql.charAt(index);
    const nextChar = sql.charAt(index + 1);

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

    if (char === "(") {
      depth += 1;
    }

    if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    index += 1;
  }

  return depth;
};

const getCurrentWord = (sql: string, cursorIndex: number) => {
  const textBefore = sql.slice(0, cursorIndex);
  const openBracket = textBefore.lastIndexOf("[");
  const closeBracket = textBefore.lastIndexOf("]");
  if (openBracket > closeBracket) {
    return textBefore.slice(openBracket + 1).trim();
  }
  const match = /([A-Za-z0-9_]+)$/.exec(textBefore);
  return match?.[1] ?? "";
};

const getAliasBeforeDot = (sql: string, cursorIndex: number) => {
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dotIndex = -1;

  for (let i = cursorIndex - 1; i >= 0; i -= 1) {
    const char = sql.charAt(i);
    const prevChar = i > 0 ? sql.charAt(i - 1) : "";

    if (!inDoubleQuote && char === "'" && prevChar !== "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === "]") {
      bracketDepth += 1;
      continue;
    }
    if (char === "[") {
      if (bracketDepth > 0) {
        bracketDepth -= 1;
        continue;
      }
    }
    if (bracketDepth > 0) {
      continue;
    }

    if (/\s|,|\(|\)/.test(char)) {
      break;
    }

    if (char === ".") {
      dotIndex = i;
      break;
    }
  }

  if (dotIndex === -1) {
    return null;
  }

  let alias: string | null = null;
  if (dotIndex > 0 && sql.charAt(dotIndex - 1) === "]") {
    const openIndex = sql.lastIndexOf("[", dotIndex - 1);
    if (openIndex === -1) {
      return null;
    }
    alias = sql.slice(openIndex + 1, dotIndex - 1).trim() || null;
  } else {
    let start = dotIndex - 1;
    while (start >= 0 && /[A-Za-z0-9_]/.test(sql.charAt(start))) {
      start -= 1;
    }
    alias = sql.slice(start + 1, dotIndex) || null;
  }

  if (alias?.toLowerCase() === "ent") {
    return null;
  }

  return alias;
};

const getLastKeyword = (
  tokens: SqlToken[],
  cursorIndex: number,
  depth: number,
) => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens.at(index);
    if (!token) {
      continue;
    }
    if (token.startIndex >= cursorIndex) {
      continue;
    }
    if (token.depth !== depth) {
      continue;
    }
    if (token.type !== "word") {
      continue;
    }
    const value = token.value.toLowerCase();
    if (SQL_KEYWORDS.has(value)) {
      return value;
    }
  }
  return null;
};

const getLastFromJoinToken = (
  tokens: SqlToken[],
  cursorIndex: number,
  depth: number,
) => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens.at(index);
    if (!token) {
      continue;
    }
    if (token.startIndex >= cursorIndex) {
      continue;
    }
    if (token.depth !== depth) {
      continue;
    }
    if (token.type !== "word") {
      continue;
    }
    const value = token.value.toLowerCase();
    if (value === "from" || value === "join") {
      return token;
    }
  }
  return null;
};

export interface SqlCursorContext {
  cursorDepth: number;
  currentWord: string;
  aliasBeforeDot: string | null;
  isAfterFromJoin: boolean;
  isAfterSelect: boolean;
  lastKeyword: string | null;
  hasTableReference: boolean;
  cursorInTableReference: boolean;
  hasFromJoinTable: boolean;
  cursorInFromJoinTable: boolean;
  tablesInScope: SqlTableReference[];
  aliasMap: Map<string, SqlTableReference>;
}

export const getSqlCursorContext = (
  sql: string,
  cursorIndex: number,
): SqlCursorContext => {
  const cursorDepth = getCursorDepth(sql, cursorIndex);
  const tokens = tokenizeSql(sql);
  const tables = extractTableReferences(sql).filter(
    (table) => table.scopeDepth === cursorDepth,
  );

  const aliasMap = new Map<string, SqlTableReference>();
  tables.forEach((table) => {
    if (table.alias) {
      aliasMap.set(table.alias.toLowerCase(), table);
    }
  });

  const lastKeyword = getLastKeyword(tokens, cursorIndex, cursorDepth);
  const lastFromJoinToken = getLastFromJoinToken(
    tokens,
    cursorIndex,
    cursorDepth,
  );
  const fromJoinTable = lastFromJoinToken
    ? tables.find((table) => table.startIndex > lastFromJoinToken.startIndex)
    : undefined;
  const hasFromJoinTable = Boolean(
    fromJoinTable && fromJoinTable.startIndex < cursorIndex,
  );
  const cursorInFromJoinTable = Boolean(
    fromJoinTable &&
    cursorIndex >= fromJoinTable.startIndex &&
    cursorIndex <= fromJoinTable.endIndex,
  );
  const hasTableReference =
    (lastKeyword === "from" || lastKeyword === "join") &&
    tables.some((table) => table.startIndex < cursorIndex);
  const cursorInTableReference = tables.some(
    (table) => cursorIndex >= table.startIndex && cursorIndex <= table.endIndex,
  );

  return {
    cursorDepth,
    currentWord: getCurrentWord(sql, cursorIndex),
    aliasBeforeDot: getAliasBeforeDot(sql, cursorIndex),
    isAfterFromJoin: lastKeyword === "from" || lastKeyword === "join",
    isAfterSelect: lastKeyword === "select",
    lastKeyword,
    hasTableReference,
    cursorInTableReference,
    hasFromJoinTable,
    cursorInFromJoinTable,
    tablesInScope: tables,
    aliasMap,
  };
};
