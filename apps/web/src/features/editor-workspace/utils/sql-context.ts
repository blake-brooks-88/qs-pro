import type { Folder } from "@/features/editor-workspace/types";

export type SqlTokenType = "word" | "bracket" | "symbol";

export interface SqlToken {
  type: SqlTokenType;
  value: string;
  startIndex: number;
  endIndex: number;
  depth: number;
}

export interface SqlTableReference {
  name: string;
  qualifiedName: string;
  alias?: string;
  startIndex: number;
  endIndex: number;
  isBracketed: boolean;
  isSubquery: boolean;
  scopeDepth: number;
  outputFields: string[];
}

const KEYWORDS = new Set([
  "select",
  "from",
  "join",
  "where",
  "group",
  "order",
  "having",
  "on",
  "inner",
  "left",
  "right",
  "full",
  "cross",
  "union",
  "limit",
  "as",
]);

const isWordChar = (value: string) => /[A-Za-z0-9_]/.test(value);

const isAliasToken = (token?: SqlToken) => {
  if (!token || token.type === "symbol") return false;
  return !KEYWORDS.has(token.value.toLowerCase());
};

/**
 * Extracts alias from tokens starting at a given index.
 * Handles both "TableName alias" and "TableName AS alias" patterns.
 */
const extractAliasFromTokens = (
  tokens: SqlToken[],
  startIndex: number,
): string | undefined => {
  let index = startIndex;

  // Skip symbol tokens (commas, dots, etc.)
  let currentToken = tokens.at(index);
  while (currentToken && currentToken.type === "symbol") {
    index += 1;
    currentToken = tokens.at(index);
  }

  // Handle optional AS keyword
  const tokenAtIndex = tokens.at(index);
  if (tokenAtIndex?.value.toLowerCase() === "as") {
    index += 1;
  }

  // Return alias if valid
  const aliasToken = tokens.at(index);
  return isAliasToken(aliasToken) ? aliasToken?.value : undefined;
};

const isWhitespace = (value: string) => /\s/.test(value);

const scanUntil = (sql: string, startIndex: number, endChar: string) => {
  let index = startIndex;
  while (index < sql.length) {
    const char = sql.charAt(index);
    if (char === endChar) return index;
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

const findClosingParenIndex = (sql: string, startIndex: number) => {
  let depth = 0;
  let index = startIndex;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;

  while (index < sql.length) {
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
      depth -= 1;
      if (depth === 0) return index;
    }

    index += 1;
  }

  return sql.length - 1;
};

const extractSelectFields = (sql: string): string[] => {
  const tokens = tokenizeSql(sql);
  const lowerTokens = tokens.map((token) => token.value.toLowerCase());
  const selectIndex = lowerTokens.findIndex((value) => value === "select");
  if (selectIndex === -1) return [];

  let fromIndex = tokens.findIndex((token, index) => {
    if (index <= selectIndex) return false;
    return token.type === "word" && token.value.toLowerCase() === "from";
  });

  if (fromIndex === -1) {
    fromIndex = tokens.length;
  }

  const fieldTokens = tokens.slice(selectIndex + 1, fromIndex);
  const fields: string[] = [];
  let segment: SqlToken[] = [];

  const pushSegmentField = () => {
    if (segment.length === 0) return;
    const asIndex = segment.findIndex(
      (token) => token.type === "word" && token.value.toLowerCase() === "as",
    );
    const pickToken = (tokensToScan: SqlToken[]) => {
      for (let i = tokensToScan.length - 1; i >= 0; i -= 1) {
        const token = tokensToScan.at(i);
        if (!token) continue;
        if (token.type === "word" || token.type === "bracket") return token;
      }
      return undefined;
    };

    const aliasToken =
      asIndex >= 0 ? pickToken(segment.slice(asIndex + 1)) : undefined;
    const fallbackToken = pickToken(segment);
    const target = aliasToken ?? fallbackToken;

    if (target) {
      const name = target.value.trim();
      if (name && name !== "*") {
        fields.push(name);
      }
    }
  };

  fieldTokens.forEach((token) => {
    if (token.type === "symbol" && token.value === ",") {
      pushSegmentField();
      segment = [];
      return;
    }
    segment.push(token);
  });
  pushSegmentField();

  return Array.from(new Set(fields));
};

export const extractTableReferences = (sql: string): SqlTableReference[] => {
  const tokens = tokenizeSql(sql);
  const references: SqlTableReference[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens.at(index);
    if (!token) continue;
    if (token.type !== "word") continue;

    const keyword = token.value.toLowerCase();
    if (keyword !== "from" && keyword !== "join") continue;

    let nextIndex = index + 1;
    let nextTokenCheck = tokens.at(nextIndex);
    while (
      nextTokenCheck &&
      nextTokenCheck.type === "symbol" &&
      nextTokenCheck.value === ","
    ) {
      nextIndex += 1;
      nextTokenCheck = tokens.at(nextIndex);
    }

    const nextToken = tokens.at(nextIndex);
    if (!nextToken) continue;

    if (nextToken.type === "symbol" && nextToken.value === "(") {
      const subqueryStart = nextToken.startIndex;
      const subqueryEnd = findClosingParenIndex(sql, subqueryStart);
      const subquerySql = sql.slice(subqueryStart + 1, subqueryEnd);
      const outputFields = extractSelectFields(subquerySql);
      const aliasTokenIndex = tokens.findIndex(
        (t) => t.startIndex > subqueryEnd,
      );
      const alias =
        aliasTokenIndex !== -1
          ? extractAliasFromTokens(tokens, aliasTokenIndex)
          : undefined;

      references.push({
        name: "subquery",
        qualifiedName: "subquery",
        alias,
        startIndex: subqueryStart,
        endIndex: subqueryEnd + 1,
        isBracketed: false,
        isSubquery: true,
        scopeDepth: token.depth,
        outputFields,
      });
      continue;
    }

    let tableToken = nextToken;
    let tableName = tableToken.value;
    let qualifiedName = tableName;
    let startIndex = tableToken.startIndex;
    let endIndex = tableToken.endIndex;
    let isBracketed = tableToken.type === "bracket";

    const entToken = tableToken.type === "word" ? tableToken : undefined;
    const dotToken = tokens.at(nextIndex + 1);
    const entNameToken = tokens.at(nextIndex + 2);

    if (
      entToken &&
      entToken.value.toLowerCase() === "ent" &&
      dotToken?.type === "symbol" &&
      dotToken.value === "." &&
      entNameToken &&
      entNameToken.type !== "symbol"
    ) {
      tableToken = entNameToken;
      tableName = entNameToken.value;
      qualifiedName = `ENT.${tableName}`;
      startIndex = entToken.startIndex;
      endIndex = entNameToken.endIndex;
      isBracketed = entNameToken.type === "bracket";
    }

    // For ENT patterns, table is at nextIndex+2; otherwise nextIndex
    const tableTokenIndex =
      entToken && dotToken?.value === "." ? nextIndex + 2 : nextIndex;
    const alias = extractAliasFromTokens(tokens, tableTokenIndex + 1);

    references.push({
      name: tableName,
      qualifiedName,
      alias,
      startIndex,
      endIndex,
      isBracketed,
      isSubquery: false,
      scopeDepth: token.depth,
      outputFields: [],
    });
  }

  return references;
};

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
  // Support both `a.|` and `a.pa|` (typing after a dot), as Monaco can re-invoke
  // completion providers while filtering.
  //
  // We intentionally only look for a dot within the current token (no whitespace)
  // and ignore dots inside bracketed identifiers.
  let bracketDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let dotIndex = -1;

  for (let i = cursorIndex - 1; i >= 0; i -= 1) {
    const char = sql.charAt(i);
    const prevChar = i > 0 ? sql.charAt(i - 1) : "";

    // Skip if inside quotes (scanning backwards)
    if (!inDoubleQuote && char === "'" && prevChar !== "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inSingleQuote && char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) continue;

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
    if (bracketDepth > 0) continue;

    // Stop at token boundaries; `alias.field` has no whitespace between alias and dot.
    if (/\s|,|\(|\)/.test(char)) {
      break;
    }

    if (char === ".") {
      dotIndex = i;
      break;
    }
  }

  if (dotIndex === -1) return null;

  let alias: string | null = null;
  if (dotIndex > 0 && sql.charAt(dotIndex - 1) === "]") {
    const openIndex = sql.lastIndexOf("[", dotIndex - 1);
    if (openIndex === -1) return null;
    alias = sql.slice(openIndex + 1, dotIndex - 1).trim() || null;
  } else {
    let start = dotIndex - 1;
    while (start >= 0 && /[A-Za-z0-9_]/.test(sql.charAt(start))) {
      start -= 1;
    }
    alias = sql.slice(start + 1, dotIndex) || null;
  }

  // ENT is the shared folder prefix, not an alias
  if (alias?.toLowerCase() === "ent") return null;

  return alias;
};

const getLastKeyword = (
  tokens: SqlToken[],
  cursorIndex: number,
  depth: number,
) => {
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens.at(index);
    if (!token) continue;
    if (token.startIndex >= cursorIndex) continue;
    if (token.depth !== depth) continue;
    if (token.type !== "word") continue;
    const value = token.value.toLowerCase();
    if (KEYWORDS.has(value)) return value;
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
    if (!token) continue;
    if (token.startIndex >= cursorIndex) continue;
    if (token.depth !== depth) continue;
    if (token.type !== "word") continue;
    const value = token.value.toLowerCase();
    if (value === "from" || value === "join") return token;
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

export interface SqlSelectFieldRange {
  startIndex: number;
  endIndex: number;
  type: "field" | "alias";
}

const isIdentifierToken = (token: SqlToken) => {
  if (token.type !== "word" && token.type !== "bracket") return false;
  return !KEYWORDS.has(token.value.toLowerCase());
};

export const extractSelectFieldRanges = (
  sql: string,
): SqlSelectFieldRange[] => {
  const tokens = tokenizeSql(sql);
  const selectIndex = tokens.findIndex(
    (token) => token.type === "word" && token.value.toLowerCase() === "select",
  );
  if (selectIndex === -1) return [];
  const selectToken = tokens.at(selectIndex);
  const fromIndex = tokens.findIndex(
    (token, index) =>
      index > selectIndex &&
      token.type === "word" &&
      token.value.toLowerCase() === "from" &&
      token.depth === selectToken?.depth,
  );

  const endIndex = fromIndex === -1 ? tokens.length : fromIndex;
  const clauseTokens = tokens.slice(selectIndex + 1, endIndex);
  const segments: SqlToken[][] = [];
  let current: SqlToken[] = [];

  clauseTokens.forEach((token) => {
    if (token.type === "symbol" && token.value === ",") {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push(token);
  });
  if (current.length) segments.push(current);

  const ranges: SqlSelectFieldRange[] = [];

  segments.forEach((segment) => {
    const identifiers = segment.filter(isIdentifierToken);
    if (identifiers.length === 0) return;

    const asIndex = segment.findIndex(
      (token) => token.type === "word" && token.value.toLowerCase() === "as",
    );

    let aliasToken: SqlToken | undefined;
    if (asIndex !== -1) {
      aliasToken = segment.slice(asIndex + 1).find(isIdentifierToken);
    } else if (identifiers.length > 1) {
      aliasToken = identifiers.at(identifiers.length - 1);
    }

    const fieldToken =
      asIndex !== -1
        ? [...segment.slice(0, asIndex)].reverse().find(isIdentifierToken)
        : identifiers.at(
            aliasToken ? identifiers.length - 2 : identifiers.length - 1,
          );

    if (fieldToken) {
      ranges.push({
        startIndex: fieldToken.startIndex,
        endIndex: fieldToken.endIndex,
        type: "field",
      });
    }

    if (aliasToken && aliasToken !== fieldToken) {
      ranges.push({
        startIndex: aliasToken.startIndex,
        endIndex: aliasToken.endIndex,
        type: "alias",
      });
    }
  });

  return ranges;
};

export const getSharedFolderIds = (folders: Folder[]) => {
  const sharedRoots = folders.filter(
    (folder) => folder.name.trim().toLowerCase() === "shared",
  );
  if (sharedRoots.length === 0) return new Set<string>();

  const byParent = new Map<string | null, Folder[]>();
  folders.forEach((folder) => {
    const key = folder.parentId ?? null;
    const existing = byParent.get(key) ?? [];
    existing.push(folder);
    byParent.set(key, existing);
  });

  const sharedIds = new Set<string>();
  const queue = [...sharedRoots];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    sharedIds.add(current.id);
    const children = byParent.get(current.id) ?? [];
    children.forEach((child) => queue.push(child));
  }

  return sharedIds;
};

/**
 * Checks if the cursor is inside a string literal (single or double quoted).
 * Handles SQL escape sequences (doubled quotes).
 *
 * @param sql - The SQL text
 * @param cursorIndex - The cursor position
 * @returns true if cursor is inside a string literal
 */
export function isInsideString(sql: string, cursorIndex: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    if (inSingleQuote) {
      if (char === "'") {
        // Check for escaped single quote (doubled)
        if (nextChar === "'") {
          i++; // Skip the escaped quote
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

/**
 * Checks if the cursor is inside a comment (line or block).
 *
 * @param sql - The SQL text
 * @param cursorIndex - The cursor position
 * @returns true if cursor is inside a comment
 */
export function isInsideComment(sql: string, cursorIndex: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    // Skip string content
    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i++;
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

    // Handle line comments
    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    // Handle block comments
    if (inBlockComment) {
      if (char === "*" && nextChar === "/") {
        inBlockComment = false;
        i++; // Skip the '/'
      }
      continue;
    }

    // Start of comments (only when not in strings)
    if (char === "-" && nextChar === "-") {
      inLineComment = true;
      i++; // Skip the second '-'
      continue;
    }

    if (char === "/" && nextChar === "*") {
      inBlockComment = true;
      i++; // Skip the '*'
      continue;
    }

    // Track string delimiters
    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  return inLineComment || inBlockComment;
}

/**
 * Checks if the cursor is inside square brackets [...].
 *
 * @param sql - The SQL text
 * @param cursorIndex - The cursor position
 * @returns true if cursor is inside brackets
 */
export function isInsideBrackets(sql: string, cursorIndex: number): boolean {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBracket = false;
  let bracketDepth = 0;

  for (let i = 0; i < cursorIndex && i < sql.length; i++) {
    const char = sql.charAt(i);
    const nextChar = i + 1 < sql.length ? sql.charAt(i + 1) : "";

    // Skip string content
    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i++;
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

    // Track brackets
    if (char === "[") {
      bracketDepth++;
      inBracket = true;
    } else if (char === "]") {
      bracketDepth = Math.max(0, bracketDepth - 1);
      if (bracketDepth === 0) {
        inBracket = false;
      }
    }

    // Track string delimiters
    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  return inBracket;
}

/**
 * Checks if the cursor is immediately after a comparison operator.
 * Handles: =, !=, <>, <, >, <=, >=
 *
 * @param sql - The SQL text
 * @param cursorIndex - The cursor position
 * @returns true if cursor is after a comparison operator
 */
export function isAfterComparisonOperator(
  sql: string,
  cursorIndex: number,
): boolean {
  // Get text before cursor, trimming trailing whitespace
  const textBefore = sql.slice(0, cursorIndex).trimEnd();
  if (textBefore.length === 0) return false;

  // Check for two-character operators: !=, <>, <=, >=
  if (textBefore.length >= 2) {
    const lastTwo = textBefore.slice(-2);
    if (["!=", "<>", "<=", ">="].includes(lastTwo)) {
      return true;
    }
  }

  // Check for single-character operators: =, <, >
  const lastChar = textBefore.charAt(textBefore.length - 1);
  return ["=", "<", ">"].includes(lastChar);
}

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

/**
 * Checks if the cursor is inside function parentheses.
 * Distinguishes between function calls (e.g., LEFT(...)) and subqueries.
 *
 * @param sql - The SQL text
 * @param cursorIndex - The cursor position
 * @returns true if cursor is inside function parentheses
 */
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

    // Skip string content
    if (inSingleQuote) {
      if (char === "'") {
        if (nextChar === "'") {
          i++;
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

    // Track parentheses
    if (char === "(") {
      // Check if there's a function name immediately before this paren
      // Look backwards to find the word before the paren
      let wordStart = -1;
      let wordEnd = -1;

      // Find the last non-whitespace character before the paren
      for (let j = i - 1; j >= 0; j--) {
        if (!/\s/.test(sql.charAt(j))) {
          wordEnd = j + 1;
          break;
        }
      }

      // If we found a non-whitespace char, find where the word starts
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

      // Extract the word before the paren
      let isFunction = false;
      if (wordStart !== -1 && wordEnd !== -1) {
        const wordBefore = sql.slice(wordStart, wordEnd).toLowerCase();
        // It's a function if:
        // 1. There's a word before the paren
        // 2. The word is not a SQL keyword (like FROM, JOIN, WHERE, etc.)
        isFunction =
          wordBefore.length > 0 && !SQL_KEYWORDS_FOR_PARENS.has(wordBefore);
      }

      parenStack.push({ isFunction });
    } else if (char === ")") {
      parenStack.pop();
    }

    // Track string delimiters
    if (char === "'") {
      inSingleQuote = true;
    } else if (char === '"') {
      inDoubleQuote = true;
    }
  }

  // If we're inside any paren that is a function call, return true
  return parenStack.some((p) => p.isFunction);
}

export function isAtEndOfBracketedTableInFromJoin(
  sql: string,
  cursorIndex: number,
): boolean {
  // Handle auto-closed brackets: cursor could be inside [TableName|] where | is cursor
  // Find the matching open bracket by scanning backwards from cursor
  let openBracketIndex = -1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let bracketDepth = 0;

  // Scan backwards from cursor to find the opening bracket
  for (let i = cursorIndex - 1; i >= 0; i--) {
    const char = sql.charAt(i);
    const prevChar = i > 0 ? sql.charAt(i - 1) : "";

    // Skip if inside quotes (scanning backwards)
    if (char === "'" && prevChar !== "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (inSingleQuote || inDoubleQuote) continue;

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
    if (!token) continue;
    if (token.type !== "word") continue;
    const value = token.value.toLowerCase();

    if (value === "from" || value === "join") {
      return true;
    }

    if (KEYWORDS.has(value)) {
      return false;
    }
  }

  return false;
}
