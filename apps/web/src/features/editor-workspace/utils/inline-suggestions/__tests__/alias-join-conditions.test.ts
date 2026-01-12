import { describe, it, expect, vi } from "vitest";
import { aliasSuggestionRule } from "../rules/alias-suggestion-rule";
import type { InlineSuggestionContext } from "../types";
import type { DataExtensionField } from "@/features/editor-workspace/types";
import { getSqlCursorContext } from "../../sql-context";

/**
 * Helper to create mock context for testing inline suggestion rules.
 */
function createMockContext(
  sql: string,
  cursorIndex: number,
  options: {
    tablesInScope?: InlineSuggestionContext["tablesInScope"];
    existingAliases?: string[];
    fieldData?: Record<string, DataExtensionField[]>;
  } = {},
): InlineSuggestionContext {
  const sqlContext = getSqlCursorContext(sql, cursorIndex);

  return {
    sql,
    cursorIndex,
    sqlContext,
    tablesInScope: options.tablesInScope || [],
    existingAliases: new Set(options.existingAliases || []),
    getFieldsForTable: vi.fn(async (table) => {
      const tableName = table.qualifiedName;
      return options.fieldData?.[tableName] || [];
    }),
  };
}

describe("aliasSuggestionRule", () => {
  describe("Alias suggestion after table reference", () => {
    it("aliasSuggestionRule_AfterTableReferenceWithSpace_SuggestsAlias", async () => {
      // Arrange
      const sql = "SELECT * FROM Users JOIN Contacts ";
      const cursorIndex = sql.length;
      const ctx = createMockContext(sql, cursorIndex, {
        tablesInScope: [
          {
            name: "Users",
            qualifiedName: "Users",
            startIndex: 14,
            endIndex: 19,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "Contacts",
            qualifiedName: "Contacts",
            startIndex: 25,
            endIndex: 33,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
        ],
        existingAliases: ["u"],
      });

      // Act
      const matches = aliasSuggestionRule.matches(ctx);
      const suggestion = matches
        ? await aliasSuggestionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      expect(suggestion?.text).toBe(" AS c");
      expect(suggestion?.priority).toBe(80);
    });

    it("aliasSuggestionRule_AfterTableWithAlias_DoesNotSuggest", async () => {
      // Arrange
      const sql = "SELECT * FROM Users u JOIN Contacts c ";
      const cursorIndex = sql.length;
      const ctx = createMockContext(sql, cursorIndex, {
        tablesInScope: [
          {
            name: "Users",
            qualifiedName: "Users",
            alias: "u",
            startIndex: 14,
            endIndex: 19,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "Contacts",
            qualifiedName: "Contacts",
            alias: "c",
            startIndex: 28,
            endIndex: 36,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
        ],
      });

      // Act
      const matches = aliasSuggestionRule.matches(ctx);

      // Assert
      expect(matches).toBe(false);
    });
  });

  describe("ENT. prefix handling", () => {
    it("aliasSuggestionRule_EnterpriseTableWithPrefix_UsesNameAfterPrefix", async () => {
      // Arrange
      const sql = "SELECT * FROM Users JOIN ENT.CustomerContacts ";
      const cursorIndex = sql.length;
      const ctx = createMockContext(sql, cursorIndex, {
        tablesInScope: [
          {
            name: "Users",
            qualifiedName: "Users",
            alias: "u",
            startIndex: 14,
            endIndex: 19,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "ENT.CustomerContacts",
            qualifiedName: "ENT.CustomerContacts",
            startIndex: 28,
            endIndex: 48,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
        ],
        existingAliases: ["u"],
      });

      // Act
      const matches = aliasSuggestionRule.matches(ctx);
      const suggestion = matches
        ? await aliasSuggestionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // Should use "CustomerContacts" for alias generation, not "ENT.CustomerContacts"
      expect(suggestion?.text).toBe(" AS cc");
    });
  });

  describe("Alias collision avoidance", () => {
    it("aliasSuggestionRule_AliasCollision_AvoidsDuplicates", async () => {
      // Arrange
      const sql = "SELECT * FROM Users u JOIN Contacts c JOIN Companies ";
      const cursorIndex = sql.length;
      const ctx = createMockContext(sql, cursorIndex, {
        tablesInScope: [
          {
            name: "Users",
            qualifiedName: "Users",
            alias: "u",
            startIndex: 14,
            endIndex: 19,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "Contacts",
            qualifiedName: "Contacts",
            alias: "c",
            startIndex: 28,
            endIndex: 36,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "Companies",
            qualifiedName: "Companies",
            startIndex: 43,
            endIndex: 52,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
        ],
        existingAliases: ["u", "c"],
      });

      // Act
      const matches = aliasSuggestionRule.matches(ctx);
      const suggestion = matches
        ? await aliasSuggestionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // "c" is taken, so should use abbreviated or numbered version
      expect(suggestion?.text).not.toBe(" AS c");
      expect(suggestion?.text).toMatch(/AS (comp|c2)/);
    });
  });
});
