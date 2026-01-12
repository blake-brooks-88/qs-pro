import { describe, expect, test } from "vitest";
import { joinConditionRule } from "./join-condition-rule";
import { getSqlCursorContext } from "../../sql-context";
import type { InlineSuggestionContext } from "../types";
import type { DataExtensionField } from "@/features/editor-workspace/types";

const makeFields = (names: string[]): DataExtensionField[] =>
  names.map((name) => ({
    name,
    type: "Text",
    isPrimaryKey: false,
    isNullable: true,
  }));

const buildContext = (
  sql: string,
  fieldsByAlias: Record<string, string[]> = {},
): InlineSuggestionContext => {
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
    getFieldsForTable: async (table) => {
      const alias = table.alias?.toLowerCase() || table.name.toLowerCase();
      return makeFields(fieldsByAlias[alias] || []);
    },
  };
};

describe("joinConditionRule", () => {
  test("matches_AfterOnKeyword_ReturnsTrue", () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ON ");
    expect(joinConditionRule.matches(ctx)).toBe(true);
  });

  test("matches_BeforeOnKeyword_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ");
    expect(joinConditionRule.matches(ctx)).toBe(false);
  });

  test("matches_WhileTypingField_ReturnsFalse", () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ON a.cust");
    expect(joinConditionRule.matches(ctx)).toBe(false);
  });

  test("matches_WithSingleTable_ReturnsFalse", () => {
    // Need at least 2 tables for a JOIN condition
    const ctx = buildContext("SELECT * FROM [A] a ON ");
    expect(joinConditionRule.matches(ctx)).toBe(false);
  });

  test("getSuggestion_WithMatchingFields_ReturnsSuggestion", async () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ON ", {
      a: ["customerId", "name"],
      b: ["customerId", "email"],
    });
    const suggestion = await joinConditionRule.getSuggestion(ctx);
    expect(suggestion?.text).toBe("a.customerId = b.customerId");
  });

  test("getSuggestion_WithNoMatchingFields_ReturnsNull", async () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ON ", {
      a: ["id"],
      b: ["email"],
    });
    const suggestion = await joinConditionRule.getSuggestion(ctx);
    expect(suggestion).toBeNull();
  });

  test("getSuggestion_PrioritizesExactMatch", async () => {
    const ctx = buildContext("SELECT * FROM [A] a JOIN [B] b ON ", {
      a: ["SubscriberKey", "EmailAddress"],
      b: ["SubscriberKey", "email"],
    });
    const suggestion = await joinConditionRule.getSuggestion(ctx);
    // Should match SubscriberKey exactly, not fuzzy match EmailAddress to email
    expect(suggestion?.text).toContain("SubscriberKey");
  });
});
