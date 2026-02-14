import { getContextualKeywords } from "@/features/editor-workspace/utils/autocomplete-keyword";

import { SQL_KEYWORDS } from "./sql-keywords";

export interface SqlKeywordCompletion {
  label: string;
  insertText: string;
  insertAsSnippet: boolean;
  sortText: string;
}

const KEYWORDS_WITH_BRACKETS = new Set(["FROM", "JOIN"]);

export function buildSqlKeywordCompletions(
  lastKeyword: string | null,
): SqlKeywordCompletion[] {
  const contextualKeywords = new Set(getContextualKeywords(lastKeyword));

  return SQL_KEYWORDS.map((keyword) => {
    const needsBrackets = KEYWORDS_WITH_BRACKETS.has(keyword);

    return {
      label: keyword,
      insertText: needsBrackets ? `${keyword} [$0]` : keyword,
      insertAsSnippet: needsBrackets,
      sortText: contextualKeywords.has(keyword)
        ? `0-${keyword}`
        : `1-${keyword}`,
    };
  });
}
