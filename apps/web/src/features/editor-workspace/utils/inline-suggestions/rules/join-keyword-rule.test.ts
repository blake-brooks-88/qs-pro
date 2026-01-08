import { describe, expect, test } from "vitest";
import { joinKeywordRule } from "./join-keyword-rule";
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
        .filter((a): a is string => Boolean(a))
    ),
    getFieldsForTable: async () => [],
  };
};

describe("joinKeywordRule", () => {
  test("matches_AfterINNER_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] INNER");
    expect(joinKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterLEFT_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] LEFT");
    expect(joinKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterRIGHT_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] RIGHT");
    expect(joinKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterFULL_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] FULL");
    expect(joinKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterOUTER_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] OUTER");
    expect(joinKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterCROSS_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] CROSS");
    expect(joinKeywordRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterJOIN_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN");
    expect(joinKeywordRule.matches(ctx)).toBe(false);
  });

  test("matches_AfterSELECT_ReturnsFalse", () => {
    const ctx = buildContext("SELECT");
    expect(joinKeywordRule.matches(ctx)).toBe(false);
  });

  test("getSuggestion_ReturnsJOINText", async () => {
    const ctx = buildContext("SELECT * FROM [A] INNER");
    const suggestion = await joinKeywordRule.getSuggestion(ctx);
    expect(suggestion?.text).toBe(" JOIN");
    expect(suggestion?.priority).toBe(100);
  });

  test("matches_AfterLEFTInSELECTClause_ReturnsFalse", () => {
    const ctx = buildContext("SELECT LEFT");
    expect(joinKeywordRule.matches(ctx)).toBe(false);
  });

  test("matches_AfterRIGHTInSELECTClause_ReturnsFalse", () => {
    const ctx = buildContext("SELECT RIGHT");
    expect(joinKeywordRule.matches(ctx)).toBe(false);
  });
});
