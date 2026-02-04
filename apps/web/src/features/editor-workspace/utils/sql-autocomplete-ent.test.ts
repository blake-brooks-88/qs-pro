import { describe, expect, test } from "vitest";

import { MAX_SUGGESTIONS } from "@/features/editor-workspace/constants";
import type { DataExtension, Folder } from "@/features/editor-workspace/types";
import {
  buildDataExtensionSuggestions,
  fuzzyMatch,
} from "@/features/editor-workspace/utils/sql-autocomplete";
import {
  getSharedFolderIds,
  getSqlCursorContext,
} from "@/features/editor-workspace/utils/sql-context";

describe("fuzzy matching and ENT. table suggestions", () => {
  describe("fuzzy matching order", () => {
    test("buildDataExtensionSuggestions_WithPrefixMatch_AppearsBeforeCamelCase", () => {
      // Arrange - searching for "sub"
      const dataExtensions: DataExtension[] = [
        {
          id: "de-1",
          name: "SubscriberData",
          customerKey: "SubscriberData",
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        },
        {
          id: "de-2",
          name: "Sub_Preferences",
          customerKey: "Sub_Preferences",
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        },
        {
          id: "de-3",
          name: "CustomerSubAccount",
          customerKey: "CustomerSubAccount",
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
        "sub",
      );

      // Assert
      // Prefix matches (starts with "sub") should appear first
      const firstTwo = suggestions.slice(0, 2).map((s) => s.name);
      expect(firstTwo).toContain("SubscriberData");
      expect(firstTwo).toContain("Sub_Preferences");
      // CamelCase boundary match should appear after
      expect(suggestions[2]?.name).toBe("CustomerSubAccount");
    });

    test("buildDataExtensionSuggestions_WithPrefixMatches_ShorterAppearsFirst", () => {
      // Arrange - testing that shorter prefix matches rank higher
      const dataExtensions: DataExtension[] = [
        {
          id: "de-1",
          name: "SubscriberEngagement",
          customerKey: "SubscriberEngagement",
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        },
        {
          id: "de-2",
          name: "Sub",
          customerKey: "Sub",
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        },
        {
          id: "de-3",
          name: "Subscriber",
          customerKey: "Subscriber",
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
        "sub",
      );

      // Assert
      // Shorter matches should appear first among prefix matches
      expect(suggestions[0]?.name).toBe("Sub");
      expect(suggestions[1]?.name).toBe("Subscriber");
      expect(suggestions[2]?.name).toBe("SubscriberEngagement");
    });

    test("buildDataExtensionSuggestions_WithUnderscoreBoundary_MatchesCorrectly", () => {
      // Arrange
      const dataExtensions: DataExtension[] = [
        {
          id: "de-1",
          name: "customer_sub_data",
          customerKey: "customer_sub_data",
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        },
        {
          id: "de-2",
          name: "sub_preferences",
          customerKey: "sub_preferences",
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
        "sub",
      );

      // Assert
      // Prefix match should appear before underscore boundary match
      expect(suggestions[0]?.name).toBe("sub_preferences");
      expect(suggestions[1]?.name).toBe("customer_sub_data");
    });
  });

  describe("MAX_SUGGESTIONS enforcement", () => {
    test("buildDataExtensionSuggestions_WithMoreThanMaxResults_LimitsToMaxSuggestions", () => {
      // Arrange - create 15 data extensions that all match
      const dataExtensions: DataExtension[] = Array.from(
        { length: 15 },
        (_, i) => ({
          id: `de-${i}`,
          name: `Table${i}`,
          customerKey: `Table${i}`,
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        }),
      );

      // Act
      const suggestions = buildDataExtensionSuggestions(
        dataExtensions,
        new Set(),
        "", // Empty search matches all
      );

      // Assert
      expect(suggestions.length).toBeLessThanOrEqual(MAX_SUGGESTIONS);
      expect(suggestions).toHaveLength(10); // MAX_SUGGESTIONS is 10
    });

    test("buildDataExtensionSuggestions_WithFewerThanMaxResults_ReturnsAll", () => {
      // Arrange
      const dataExtensions: DataExtension[] = Array.from(
        { length: 5 },
        (_, i) => ({
          id: `de-${i}`,
          name: `Table${i}`,
          customerKey: `Table${i}`,
          folderId: "local",
          description: "",
          fields: [],
          isShared: false,
        }),
      );

      // Act
      const suggestions = buildDataExtensionSuggestions(
        dataExtensions,
        new Set(),
        "",
      );

      // Assert
      expect(suggestions).toHaveLength(5);
    });
  });

  describe("ENT. table visibility", () => {
    test("getSqlCursorContext_AfterFromKeyword_HasFromJoinTableIsFalse", () => {
      // Arrange
      const sql = "SELECT * FROM ";
      const cursorIndex = sql.length;

      // Act
      const context = getSqlCursorContext(sql, cursorIndex);

      // Assert
      expect(context.isAfterFromJoin).toBe(true);
      expect(context.hasFromJoinTable).toBe(false);
      // This condition means tables SHOULD be suggested
    });

    test("getSqlCursorContext_AfterJoinKeyword_HasFromJoinTableIsFalse", () => {
      // Arrange
      const sql = "SELECT * FROM [Table1] INNER JOIN ";
      const cursorIndex = sql.length;

      // Act
      const context = getSqlCursorContext(sql, cursorIndex);

      // Assert
      expect(context.isAfterFromJoin).toBe(true);
      expect(context.hasFromJoinTable).toBe(false);
      // This condition means tables SHOULD be suggested
    });

    test("buildDataExtensionSuggestions_WithSharedTable_PrefixesENT", () => {
      // Arrange
      const dataExtensions: DataExtension[] = [
        {
          id: "de-1",
          name: "SharedTable",
          customerKey: "SharedTable",
          folderId: "shared-1",
          description: "",
          fields: [],
          isShared: false,
        },
        {
          id: "de-2",
          name: "LocalTable",
          customerKey: "LocalTable",
          folderId: "local-1",
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
        {
          id: "local-1",
          name: "Local",
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
      const sharedSuggestion = suggestions.find(
        (s) => s.name === "SharedTable",
      );
      const localSuggestion = suggestions.find((s) => s.name === "LocalTable");
      expect(sharedSuggestion?.label).toBe("ENT.[SharedTable]");
      expect(sharedSuggestion?.insertText).toBe("ENT.[SharedTable]");
      expect(localSuggestion?.label).toBe("[LocalTable]");
      expect(localSuggestion?.insertText).toBe("[LocalTable]");
    });

    test("buildDataExtensionSuggestions_WithENTPrefix_StripsPrefixForMatching", () => {
      // Arrange
      const dataExtensions: DataExtension[] = [
        {
          id: "de-1",
          name: "SharedTable",
          customerKey: "SharedTable",
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

      // Act - user types "ENT.Shar"
      const suggestions = buildDataExtensionSuggestions(
        dataExtensions,
        sharedFolderIds,
        "ENT.Shar",
      );

      // Assert - should still match "SharedTable"
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.name).toBe("SharedTable");
    });

    test("fuzzyMatch_WithoutPrefix_MatchesCorrectly", () => {
      // Arrange - fuzzyMatch doesn't handle ENT. prefix stripping
      // That's done by buildDataExtensionSuggestions
      const term = "shar";
      const candidate = "SharedTable";

      // Act
      const matches = fuzzyMatch(term, candidate);

      // Assert
      expect(matches).toBe(true);
    });
  });

  describe("fuzzy matching edge cases", () => {
    test("fuzzyMatch_WithEmptyTerm_ReturnsTrue", () => {
      // Arrange
      const term = "";
      const candidate = "AnyTable";

      // Act
      const matches = fuzzyMatch(term, candidate);

      // Assert
      expect(matches).toBe(true);
    });

    test("fuzzyMatch_WithCaseInsensitive_Matches", () => {
      // Arrange
      const term = "SUB";
      const candidate = "subscriber";

      // Act
      const matches = fuzzyMatch(term, candidate);

      // Assert
      expect(matches).toBe(true);
    });

    test("fuzzyMatch_WithNonContiguous_Matches", () => {
      // Arrange
      const term = "sbd";
      const candidate = "SubscriberData";

      // Act
      const matches = fuzzyMatch(term, candidate);

      // Assert
      expect(matches).toBe(true);
    });
  });
});
