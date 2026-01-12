import { describe, it, expect, vi } from "vitest";
import { aliasSuggestionRule } from "../rules/alias-suggestion-rule";
import { joinConditionRule } from "../rules/join-condition-rule";
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

describe("joinConditionRule", () => {
  describe("SFMC identity field matching", () => {
    it("joinConditionRule_ContactIdAndSubscriberKey_MatchesAsIdentityFields", async () => {
      // Arrange
      const sql = "SELECT * FROM Users u JOIN Contacts c ON ";
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
        fieldData: {
          Users: [
            {
              name: "ContactID",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "Name",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
          Contacts: [
            {
              name: "SubscriberKey",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "Email",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
        },
      });

      // Act
      const matches = joinConditionRule.matches(ctx);
      const suggestion = matches
        ? await joinConditionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // Should match ContactID with SubscriberKey as both are SFMC identity fields
      expect(suggestion?.text).toBe("u.ContactID = c.SubscriberKey");
      expect(suggestion?.priority).toBe(60);
    });

    it("joinConditionRule_MultipleIdentityFields_PrioritizesExactMatchesFirst", async () => {
      // Arrange
      const sql = "SELECT * FROM Users u JOIN Contacts c ON ";
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
        fieldData: {
          Users: [
            {
              name: "ContactID",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "SubscriberKey",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
          Contacts: [
            {
              name: "SubscriberKey",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "ContactID",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
        },
      });

      // Act
      const matches = joinConditionRule.matches(ctx);
      const suggestion = matches
        ? await joinConditionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // Should prefer exact name match (ContactID = ContactID) over cross-identity match
      expect(suggestion?.text).toBe("u.ContactID = c.ContactID");
      // Should include alternative with SubscriberKey match
      expect(suggestion?.alternatives).toBeDefined();
      expect(suggestion?.alternatives?.length).toBeGreaterThan(0);
      expect(
        suggestion?.alternatives?.some((alt) => alt.includes("SubscriberKey")),
      ).toBe(true);
    });

    it("joinConditionRule_ContactKeyAnd_ContactKey_MatchesIdentityFields", async () => {
      // Arrange
      const sql = "SELECT * FROM Orders o JOIN Customers cu ON ";
      const cursorIndex = sql.length;
      const ctx = createMockContext(sql, cursorIndex, {
        tablesInScope: [
          {
            name: "Orders",
            qualifiedName: "Orders",
            alias: "o",
            startIndex: 14,
            endIndex: 20,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "Customers",
            qualifiedName: "Customers",
            alias: "cu",
            startIndex: 27,
            endIndex: 36,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
        ],
        fieldData: {
          Orders: [
            {
              name: "_ContactKey",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "OrderDate",
              type: "Date",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
          Customers: [
            {
              name: "ContactKey",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "Name",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
        },
      });

      // Act
      const matches = joinConditionRule.matches(ctx);
      const suggestion = matches
        ? await joinConditionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // Should match _ContactKey with ContactKey as both are SFMC identity fields
      expect(suggestion?.text).toBe("o._ContactKey = cu.ContactKey");
    });
  });

  describe("JOIN condition priority ordering", () => {
    it("joinConditionRule_ExactAndIdentityMatches_ShowsExactFirst", async () => {
      // Arrange
      const sql = "SELECT * FROM Users u JOIN Contacts c ON ";
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
        fieldData: {
          Users: [
            {
              name: "UserID",
              type: "Number",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "ContactID",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "Name",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
          Contacts: [
            {
              name: "UserID",
              type: "Number",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "SubscriberKey",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
            {
              name: "Email",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
        },
      });

      // Act
      const matches = joinConditionRule.matches(ctx);
      const suggestion = matches
        ? await joinConditionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // Exact match (UserID = UserID) should be prioritized over identity field match
      expect(suggestion?.text).toBe("u.UserID = c.UserID");
      // Identity field alternatives should be included
      expect(suggestion?.alternatives).toBeDefined();
      expect(
        suggestion?.alternatives?.some(
          (alt) => alt.includes("ContactID") && alt.includes("SubscriberKey"),
        ),
      ).toBe(true);
    });

    it("joinConditionRule_NoExactMatch_SuggestsIdKeySuffixFields", async () => {
      // Arrange
      const sql = "SELECT * FROM Orders o JOIN Customers cu ON ";
      const cursorIndex = sql.length;
      const ctx = createMockContext(sql, cursorIndex, {
        tablesInScope: [
          {
            name: "Orders",
            qualifiedName: "Orders",
            alias: "o",
            startIndex: 14,
            endIndex: 20,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
          {
            name: "Customers",
            qualifiedName: "Customers",
            alias: "cu",
            startIndex: 27,
            endIndex: 36,
            isBracketed: false,
            isSubquery: false,
            scopeDepth: 0,
            outputFields: [],
          },
        ],
        fieldData: {
          Orders: [
            {
              name: "OrderID",
              type: "Number",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "CustomerID",
              type: "Number",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
          Customers: [
            {
              name: "CustomerID",
              type: "Number",
              isPrimaryKey: true,
              isNullable: false,
            },
            {
              name: "Name",
              type: "Text",
              isPrimaryKey: false,
              isNullable: true,
            },
          ],
        },
      });

      // Act
      const matches = joinConditionRule.matches(ctx);
      const suggestion = matches
        ? await joinConditionRule.getSuggestion(ctx)
        : null;

      // Assert
      expect(matches).toBe(true);
      expect(suggestion).not.toBeNull();
      // Should suggest CustomerID match (exact match)
      expect(suggestion?.text).toBe("o.CustomerID = cu.CustomerID");
    });
  });
});
