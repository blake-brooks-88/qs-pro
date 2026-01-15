import { describe, expect, test } from "vitest";
import { renderHook } from "@testing-library/react";
import type { DataExtensionField } from "@/features/editor-workspace/types";
import type { SqlTableReference } from "@/features/editor-workspace/utils/sql-context";
import { useJoinSuggestions } from "@/features/editor-workspace/utils/join-suggestions";

const makeTable = (name: string, alias?: string): SqlTableReference => ({
  name,
  qualifiedName: name,
  alias,
  startIndex: 0,
  endIndex: name.length,
  isBracketed: false,
  isSubquery: false,
  scopeDepth: 0,
  outputFields: [],
});

const makeFields = (names: string[]): DataExtensionField[] =>
  names.map((name) => ({
    name,
    type: "Text",
    isPrimaryKey: false,
    isNullable: true,
  }));

describe("join suggestions", () => {
  test("useJoinSuggestions_WithOverrides_ReturnsOverrideSuggestions", () => {
    // Arrange
    const left = makeTable("Left", "l");
    const right = makeTable("Right", "r");
    const { result } = renderHook(() =>
      useJoinSuggestions(
        new Map([["left|right", () => [{ text: "l.Id = r.Id" }]]]),
      ),
    );
    const getSuggestions = result.current;

    // Act
    const suggestions = getSuggestions({
      leftTable: left,
      rightTable: right,
      leftFields: makeFields(["Id"]),
      rightFields: makeFields(["Id"]),
    });

    // Assert
    expect(suggestions[0]?.text).toBe("l.Id = r.Id");
  });

  test("useJoinSuggestions_WithMatchingFields_ReturnsFuzzySuggestion", () => {
    // Arrange
    const left = makeTable("Left", "l");
    const right = makeTable("Right", "r");
    const { result } = renderHook(() => useJoinSuggestions());
    const getSuggestions = result.current;

    // Act
    const suggestions = getSuggestions({
      leftTable: left,
      rightTable: right,
      leftFields: makeFields(["SubscriberKey", "EmailAddress"]),
      rightFields: makeFields(["EmailAddress"]),
    });

    // Assert
    expect(suggestions.some((item) => item.text.includes("EmailAddress"))).toBe(
      true,
    );
  });
});
