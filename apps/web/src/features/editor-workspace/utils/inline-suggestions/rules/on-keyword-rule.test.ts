import { describe, expect, test } from "vitest";
import { onKeywordRule } from "./on-keyword-rule";
import { getSqlCursorContext } from "../../sql-context";
import type { InlineSuggestionContext } from "../types";

const buildContext = (sql: string): InlineSuggestionContext => {
  const cursorIndex = sql.length;
  const sqlContext = getSqlCursorContext(sql, cursorIndex);
  return {
    sql,
    cursorIndex,
    sqlContext,
    tablesInScope: sqlContext.tablesInScope,
    existingAliases: new Set(
      sqlContext.tablesInScope
        .map((t) => t.alias?.toLowerCase())
        .filter((a): a is string => Boolean(a)),
    ),
    getFieldsForTable: async () => [],
  };
};

describe("onKeywordRule", () => {
  test("matches_AfterAliasInJoin_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ");
    expect(onKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_WhenOnAlreadyPresent_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ON ");
    expect(onKeywordRule.matches(ctx)).toBe(false);
  });

  test("matches_WithoutAlias_ReturnsFalse", () => {
    // No alias on second table - alias-suggestion-rule should handle this
    const ctx = buildContext("SELECT * FROM [A] JOIN [B] ");
    expect(onKeywordRule.matches(ctx)).toBe(false);
  });

  test("matches_AfterFromAlias_ReturnsFalse", () => {
    // Only after JOIN, not FROM
    const ctx = buildContext("SELECT * FROM [Orders] o ");
    expect(onKeywordRule.matches(ctx)).toBe(false);
  });

  test("matches_WhileTyping_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b O");
    expect(onKeywordRule.matches(ctx)).toBe(false);
  });

  test("getSuggestion_ReturnsOnText", async () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ");
    const suggestion = await onKeywordRule.getSuggestion(ctx);
    expect(suggestion?.text).toBe(" ON ");
    expect(suggestion?.priority).toBe(70);
  });
});
