import { SQL_KEYWORDS } from "./keywords";
import type { SqlToken } from "./tokenize-sql";
import { tokenizeSql } from "./tokenize-sql";

export interface SqlSelectFieldRange {
  startIndex: number;
  endIndex: number;
  type: "field" | "alias";
}

const isIdentifierToken = (token: SqlToken) => {
  if (token.type !== "word" && token.type !== "bracket") {
    return false;
  }
  return !SQL_KEYWORDS.has(token.value.toLowerCase());
};

export const extractSelectFieldRanges = (
  sql: string,
): SqlSelectFieldRange[] => {
  const tokens = tokenizeSql(sql);
  const selectIndex = tokens.findIndex(
    (token) => token.type === "word" && token.value.toLowerCase() === "select",
  );
  if (selectIndex === -1) {
    return [];
  }
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
      if (current.length) {
        segments.push(current);
      }
      current = [];
      return;
    }
    current.push(token);
  });
  if (current.length) {
    segments.push(current);
  }

  const ranges: SqlSelectFieldRange[] = [];

  segments.forEach((segment) => {
    const identifiers = segment.filter(isIdentifierToken);
    if (identifiers.length === 0) {
      return;
    }

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
