import { describe, expect, test } from "vitest";

import type { DataExtension, Folder } from "@/features/editor-workspace/types";
import {
  buildDataExtensionSuggestions,
  fuzzyMatch,
  resolveTableForAlias,
} from "@/features/editor-workspace/utils/sql-autocomplete";
import {
  getSharedFolderIds,
  getSqlCursorContext,
} from "@/features/editor-workspace/utils/sql-context";

describe("sql autocomplete helpers", () => {
  test("fuzzyMatch_WithPartialTerm_ReturnsTrueWhenOrdered", () => {
    // Arrange
    const term = "seg";
    const candidate = "SubscriberSegment";

    // Act
    const matches = fuzzyMatch(term, candidate);

    // Assert
    expect(matches).toBe(true);
  });

  test("buildDataExtensionSuggestions_WithSharedFolderIds_PrefixesEnt", () => {
    // Arrange
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "Alpha",
        customerKey: "Alpha",
        folderId: "shared-1",
        description: "",
        fields: [],
        isShared: false,
      },
    ];
    const folders: Folder[] = [
      {
        id: "shared-1",
        name: "Shared",
        parentId: null,
        type: "data-extension",
      },
    ];
    const sharedFolderIds = getSharedFolderIds(folders);

    // Act
    const suggestions = buildDataExtensionSuggestions(
      dataExtensions,
      sharedFolderIds,
      "",
    );

    // Assert
    expect(suggestions[0]?.insertText).toBe("ENT.[Alpha]");
  });

  test("buildDataExtensionSuggestions_WithEmptySearch_SortsAlphabetically", () => {
    // Arrange
    const dataExtensions: DataExtension[] = [
      {
        id: "de-2",
        name: "Zulu",
        customerKey: "Zulu",
        folderId: "local",
        description: "",
        fields: [],
        isShared: false,
      },
      {
        id: "de-1",
        name: "Alpha",
        customerKey: "Alpha",
        folderId: "local",
        description: "",
        fields: [],
        isShared: false,
      },
    ];

    // Act
    const suggestions = buildDataExtensionSuggestions(
      dataExtensions,
      new Set(),
      "",
    );

    // Assert
    expect(suggestions.map((suggestion) => suggestion.label)).toEqual([
      "[Alpha]",
      "[Zulu]",
    ]);
  });

  test("getSqlCursorContext_WhenAliasBeforeDot_ReturnsAlias", () => {
    // Arrange
    const sql = "select a. from Example as a";
    const cursorIndex = sql.indexOf(".") + 1;

    // Act
    const context = getSqlCursorContext(sql, cursorIndex);

    // Assert
    expect(context.aliasBeforeDot).toBe("a");
  });

  test("getSqlCursorContext_WithCompletedFromTable_SetsHasTableReference", () => {
    // Arrange
    const sql = "select * from [My Data] ";
    const cursorIndex = sql.length;

    // Act
    const context = getSqlCursorContext(sql, cursorIndex);

    // Assert
    expect(context.hasTableReference).toBe(true);
    expect(context.cursorInTableReference).toBe(false);
  });

  test("getSqlCursorContext_WithEntTableAlias_ExtractsAlias", () => {
    // Arrange
    const sql = "SELECT * FROM ENT.[Table1] t1 INNER JOIN ENT.[Table2] t2 ON ";
    const cursorIndex = sql.length;

    // Act
    const context = getSqlCursorContext(sql, cursorIndex);

    // Assert
    expect(context.tablesInScope).toHaveLength(2);
    expect(context.tablesInScope[0]?.alias).toBe("t1");
    expect(context.tablesInScope[1]?.alias).toBe("t2");
  });

  test("getSqlCursorContext_WithAliasDot_ReturnsAliasBeforeDot", () => {
    // Arrange - cursor right after "t1."
    const sql = "SELECT t1. FROM ENT.[Table1] t1";
    const cursorIndex = sql.indexOf("t1.") + 3; // After the dot

    // Act
    const context = getSqlCursorContext(sql, cursorIndex);

    // Assert
    expect(context.aliasBeforeDot).toBe("t1");
    expect(context.tablesInScope).toHaveLength(1);
    expect(context.tablesInScope[0]?.alias).toBe("t1");
  });

  test("resolveTableForAlias_WithEntTable_FindsTableByAlias", () => {
    // Arrange
    const sql = "SELECT t1. FROM ENT.[Table1] t1";
    const cursorIndex = sql.indexOf("t1.") + 3;
    const context = getSqlCursorContext(sql, cursorIndex);

    // Act
    const table = resolveTableForAlias("t1", context.tablesInScope);

    // Assert
    expect(table).toBeDefined();
    expect(table?.alias).toBe("t1");
    expect(table?.qualifiedName).toBe("ENT.Table1");
  });

  test("resolveTableForAlias_WithRegularTable_FindsTableByAlias", () => {
    // Arrange
    const sql = "SELECT t1. FROM [Table1] t1";
    const cursorIndex = sql.indexOf("t1.") + 3;
    const context = getSqlCursorContext(sql, cursorIndex);

    // Act
    const table = resolveTableForAlias("t1", context.tablesInScope);

    // Assert
    expect(table).toBeDefined();
    expect(table?.alias).toBe("t1");
    expect(table?.qualifiedName).toBe("Table1");
  });
});
