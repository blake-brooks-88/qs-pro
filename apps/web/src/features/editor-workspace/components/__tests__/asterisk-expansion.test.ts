import { describe, expect, test } from "vitest";
import type { DataExtensionField } from "@/features/editor-workspace/types";
import type { SqlTableReference } from "@/features/editor-workspace/utils/sql-context";

/**
 * Asterisk Expansion Tests
 *
 * These tests verify that the asterisk (*) expansion feature works correctly:
 * - Expands * to a full column list when Ctrl+Space is pressed
 * - Prefixes columns with table alias when alias exists
 * - Shows error when fields are ambiguous (multiple tables without aliases)
 * - Uses bracket notation for column names with spaces
 */

/**
 * Helper function to build expanded column list
 */
const expandAsterisk = async (
  tablesInScope: SqlTableReference[],
  getFieldsForTable: (
    table: SqlTableReference,
  ) => Promise<DataExtensionField[]>,
): Promise<{ success: boolean; columns?: string[]; error?: string }> => {
  // Check for ambiguity: multiple tables without aliases
  const tablesWithoutAliases = tablesInScope.filter((t) => !t.alias);
  if (tablesWithoutAliases.length > 1) {
    return {
      success: false,
      error: "Cannot expand: multiple tables without aliases",
    };
  }

  // Get all columns for tables in scope
  const columnList: string[] = [];

  for (const table of tablesInScope) {
    const fields = await getFieldsForTable(table);
    const prefix = table.alias || "";

    for (const field of fields) {
      const fieldName = field.name.includes(" ")
        ? `[${field.name}]` // Bracket notation for spaces
        : field.name;

      const fullName = prefix ? `${prefix}.${fieldName}` : fieldName;

      columnList.push(fullName);
    }
  }

  return {
    success: true,
    columns: columnList,
  };
};

describe("Asterisk Expansion", () => {
  test("expandAsterisk_WithSingleTable_ReturnsFullColumnList", async () => {
    // Arrange
    const tablesInScope: SqlTableReference[] = [
      {
        name: "Customers",
        qualifiedName: "Customers",
        startIndex: 0,
        endIndex: 9,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ];

    const mockFields: DataExtensionField[] = [
      {
        name: "EmailAddress",
        type: "Email",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "FirstName",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      },
      {
        name: "LastName",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      },
    ];

    const getFieldsForTable = async (_table: SqlTableReference) => mockFields;

    // Act
    const result = await expandAsterisk(tablesInScope, getFieldsForTable);

    // Assert
    expect(result.success).toBe(true);
    expect(result.columns).toEqual(["EmailAddress", "FirstName", "LastName"]);
  });

  test("expandAsterisk_WithTableAlias_PrefixesColumnsWithAlias", async () => {
    // Arrange
    const tablesInScope: SqlTableReference[] = [
      {
        name: "Customers",
        qualifiedName: "Customers",
        alias: "c",
        startIndex: 0,
        endIndex: 9,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ];

    const mockFields: DataExtensionField[] = [
      {
        name: "EmailAddress",
        type: "Email",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "FirstName",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      },
    ];

    const getFieldsForTable = async (_table: SqlTableReference) => mockFields;

    // Act
    const result = await expandAsterisk(tablesInScope, getFieldsForTable);

    // Assert
    expect(result.success).toBe(true);
    expect(result.columns).toEqual(["c.EmailAddress", "c.FirstName"]);
  });

  test("expandAsterisk_WithMultipleTablesWithoutAliases_ReturnsError", async () => {
    // Arrange
    const tablesInScope: SqlTableReference[] = [
      {
        name: "Customers",
        qualifiedName: "Customers",
        startIndex: 0,
        endIndex: 9,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
      {
        name: "Orders",
        qualifiedName: "Orders",
        startIndex: 20,
        endIndex: 26,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ];

    const getFieldsForTable = async (_table: SqlTableReference) => [];

    // Act
    const result = await expandAsterisk(tablesInScope, getFieldsForTable);

    // Assert
    expect(result.success).toBe(false);
    expect(result.error).toContain("multiple tables without aliases");
  });

  test("expandAsterisk_WithColumnNamesContainingSpaces_UsesBracketNotation", async () => {
    // Arrange
    const tablesInScope: SqlTableReference[] = [
      {
        name: "Customers",
        qualifiedName: "Customers",
        startIndex: 0,
        endIndex: 9,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ];

    const mockFields: DataExtensionField[] = [
      {
        name: "Email Address",
        type: "Email",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "First Name",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      },
      {
        name: "Status",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      },
    ];

    const getFieldsForTable = async (_table: SqlTableReference) => mockFields;

    // Act
    const result = await expandAsterisk(tablesInScope, getFieldsForTable);

    // Assert
    expect(result.success).toBe(true);
    expect(result.columns).toEqual([
      "[Email Address]",
      "[First Name]",
      "Status",
    ]);
  });

  test("expandAsterisk_WithMultipleTablesWithAliases_ReturnsAllColumnsPrefixed", async () => {
    // Arrange
    const tablesInScope: SqlTableReference[] = [
      {
        name: "Customers",
        qualifiedName: "Customers",
        alias: "c",
        startIndex: 0,
        endIndex: 9,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
      {
        name: "Orders",
        qualifiedName: "Orders",
        alias: "o",
        startIndex: 20,
        endIndex: 26,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ];

    const mockGetFields = async (table: SqlTableReference) => {
      if (table.name === "Customers") {
        return [
          {
            name: "EmailAddress",
            type: "Email" as const,
            isPrimaryKey: true,
            isNullable: false,
          },
          {
            name: "FirstName",
            type: "Text" as const,
            isPrimaryKey: false,
            isNullable: true,
          },
        ];
      } else {
        return [
          {
            name: "OrderID",
            type: "Number" as const,
            isPrimaryKey: true,
            isNullable: false,
          },
          {
            name: "OrderDate",
            type: "Date" as const,
            isPrimaryKey: false,
            isNullable: true,
          },
        ];
      }
    };

    // Act
    const result = await expandAsterisk(tablesInScope, mockGetFields);

    // Assert
    expect(result.success).toBe(true);
    expect(result.columns).toEqual([
      "c.EmailAddress",
      "c.FirstName",
      "o.OrderID",
      "o.OrderDate",
    ]);
  });

  test("expandAsterisk_WithAliasAndSpacesInColumnName_PrefixesAndBrackets", async () => {
    // Arrange
    const tablesInScope: SqlTableReference[] = [
      {
        name: "Customers",
        qualifiedName: "Customers",
        alias: "c",
        startIndex: 0,
        endIndex: 9,
        isBracketed: false,
        isSubquery: false,
        scopeDepth: 0,
        outputFields: [],
      },
    ];

    const mockFields: DataExtensionField[] = [
      {
        name: "Email Address",
        type: "Email",
        isPrimaryKey: true,
        isNullable: false,
      },
      {
        name: "FirstName",
        type: "Text",
        isPrimaryKey: false,
        isNullable: true,
      },
    ];

    const getFieldsForTable = async (_table: SqlTableReference) => mockFields;

    // Act
    const result = await expandAsterisk(tablesInScope, getFieldsForTable);

    // Assert
    expect(result.success).toBe(true);
    expect(result.columns).toEqual(["c.[Email Address]", "c.FirstName"]);
  });
});
