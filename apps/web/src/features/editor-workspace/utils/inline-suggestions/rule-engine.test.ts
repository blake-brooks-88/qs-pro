import { describe, expect, test } from "vitest";
import { evaluateInlineSuggestions } from "./rule-engine";
import { getSqlCursorContext } from "../sql-context";
import type { InlineSuggestionContext } from "./types";

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

describe("evaluateInlineSuggestions", () => {
  test("afterINNER_ReturnsJoinSuggestion", async () => {
    const ctx = buildContext("SELECT * FROM [A] INNER");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion?.text).toBe(" JOIN");
  });

  test("afterLEFT_ReturnsJoinSuggestion", async () => {
    const ctx = buildContext("SELECT * FROM [A] LEFT");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion?.text).toBe(" JOIN");
  });

  test("afterJoinTableNoAlias_ReturnsAliasSuggestion", async () => {
    const ctx = buildContext("SELECT * FROM [A] JOIN [OrderDetails] ");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion?.text).toBe(" AS od");
  });

  test("afterJoinTableWithAlias_ReturnsOnSuggestion", async () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion?.text).toBe(" ON ");
  });

  test("afterSelect_ReturnsNull", async () => {
    const ctx = buildContext("SELECT ");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion).toBeNull();
  });

  test("afterFrom_ReturnsNull", async () => {
    // No suggestions after FROM table (only after JOIN)
    const ctx = buildContext("SELECT * FROM [Orders] ");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion).toBeNull();
  });

  test("priorityOrder_JoinKeywordWins", async () => {
    // INNER should trigger join-keyword rule (priority 100)
    // not any other rule
    const ctx = buildContext("SELECT * FROM [A] INNER");
    const suggestion = await evaluateInlineSuggestions(ctx);
    expect(suggestion?.priority).toBe(100);
  });
});
