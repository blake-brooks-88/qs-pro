import { SQL_KEYWORDS } from "./keywords";
import type { SqlToken } from "./tokenize-sql";
import { tokenizeSql } from "./tokenize-sql";

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

const isAliasToken = (token?: SqlToken) => {
  if (!token || token.type === "symbol") {
    return false;
  }
  return !SQL_KEYWORDS.has(token.value.toLowerCase());
};

const extractAliasFromTokens = (
  tokens: SqlToken[],
  startIndex: number,
): string | undefined => {
  let index = startIndex;

  let currentToken = tokens.at(index);
  while (currentToken?.type === "symbol") {
    index += 1;
    currentToken = tokens.at(index);
  }

  const tokenAtIndex = tokens.at(index);
  if (tokenAtIndex?.value.toLowerCase() === "as") {
    index += 1;
  }

  const aliasToken = tokens.at(index);
  return isAliasToken(aliasToken) ? aliasToken?.value : undefined;
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
      if (depth === 0) {
        return index;
      }
    }

    index += 1;
  }

  return sql.length - 1;
};

const extractSelectFields = (sql: string): string[] => {
  const tokens = tokenizeSql(sql);
  const lowerTokens = tokens.map((token) => token.value.toLowerCase());
  const selectIndex = lowerTokens.findIndex((value) => value === "select");
  if (selectIndex === -1) {
    return [];
  }

  let fromIndex = tokens.findIndex((token, index) => {
    if (index <= selectIndex) {
      return false;
    }
    return token.type === "word" && token.value.toLowerCase() === "from";
  });

  if (fromIndex === -1) {
    fromIndex = tokens.length;
  }

  const fieldTokens = tokens.slice(selectIndex + 1, fromIndex);
  const fields: string[] = [];
  let segment: SqlToken[] = [];

  const pushSegmentField = () => {
    if (segment.length === 0) {
      return;
    }
    const asIndex = segment.findIndex(
      (token) => token.type === "word" && token.value.toLowerCase() === "as",
    );
    const pickToken = (tokensToScan: SqlToken[]) => {
      for (let i = tokensToScan.length - 1; i >= 0; i -= 1) {
        const token = tokensToScan.at(i);
        if (!token) {
          continue;
        }
        if (token.type === "word" || token.type === "bracket") {
          return token;
        }
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
    if (!token) {
      continue;
    }
    if (token.type !== "word") {
      continue;
    }

    const keyword = token.value.toLowerCase();
    if (keyword !== "from" && keyword !== "join") {
      continue;
    }

    let nextIndex = index + 1;
    let nextTokenCheck = tokens.at(nextIndex);
    while (nextTokenCheck?.type === "symbol" && nextTokenCheck.value === ",") {
      nextIndex += 1;
      nextTokenCheck = tokens.at(nextIndex);
    }

    const nextToken = tokens.at(nextIndex);
    if (!nextToken) {
      continue;
    }

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
      entToken?.value.toLowerCase() === "ent" &&
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
