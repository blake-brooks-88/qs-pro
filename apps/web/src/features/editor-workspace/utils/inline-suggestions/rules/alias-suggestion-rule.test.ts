import { describe, expect, test } from "vitest";
import { aliasSuggestionRule } from "./alias-suggestion-rule";
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

describe("aliasSuggestionRule", () => {
  test("matches_AfterJoinTableNoAlias_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN [B] ");
    expect(aliasSuggestionRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterJoinTableWithAlias_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN [B] b ");
    expect(aliasSuggestionRule.matches(ctx)).toBe(false);
  });

  test("matches_AfterFromTableNoAlias_ReturnsTrue", () => {
    // Should suggest aliases after FROM tables too
    const ctx = buildContext("SELECT * FROM [Orders] ");
    expect(aliasSuggestionRule.matches(ctx)).toBe(true);
  });

  test("matches_AfterFromTableWithWhereFollowing_ReturnsFalse", () => {
    // This tests cursor position before existing WHERE
    // We need to position cursor after table but before WHERE
    const fullSql = "SELECT * FROM [Orders] WHERE x = 1";
    const cursorIndex = "SELECT * FROM [Orders] ".length;
    const sqlContext = getSqlCursorContext(fullSql, cursorIndex);
    const ctx = {
      sql: fullSql,
      cursorIndex,
      sqlContext,
      tablesInScope: sqlContext.tablesInScope,
      existingAliases: new Set<string>(),
      getFieldsForTable: async () => [],
    };
    expect(aliasSuggestionRule.matches(ctx)).toBe(false);
  });

  test("matches_AfterFromTableWithAlias_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [Orders] o ");
    expect(aliasSuggestionRule.matches(ctx)).toBe(false);
  });

  test("matches_WhenOnAlreadyPresent_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN [B] ON ");
    expect(aliasSuggestionRule.matches(ctx)).toBe(false);
  });

  test("getSuggestion_AfterFromTable_GeneratesAlias", async () => {
    const ctx = buildContext("SELECT * FROM [CustomerOrders] ");
    const suggestion = await aliasSuggestionRule.getSuggestion(ctx);
    expect(suggestion?.text).toBe(" AS co");
  });

  test("getSuggestion_GeneratesSmartAlias_CamelCase", async () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN [OrderDetails] ");
    const suggestion = await aliasSuggestionRule.getSuggestion(ctx);
    expect(suggestion?.text).toBe(" AS od");
    expect(suggestion?.priority).toBe(80);
  });

  test("getSuggestion_GeneratesSmartAlias_SingleWord", async () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN [Customers] ");
    const suggestion = await aliasSuggestionRule.getSuggestion(ctx);
    expect(suggestion?.text).toBe(" AS c");
  });

  test("getSuggestion_AvoidsCollision_WithExistingAlias", async () => {
    // "a" is already taken by first table
    const ctx = buildContext("SELECT * FROM [Alpha] a JOIN [Accounts] ");
    const suggestion = await aliasSuggestionRule.getSuggestion(ctx);
    // Should not be "a" since it's taken, should be "acco" or "a2"
    expect(suggestion?.text).not.toBe(" AS a");
  });
});
