import { describe, expect, test } from "vitest";

import { getContextualKeywords } from "@/features/editor-workspace/utils/autocomplete-keyword";

describe("autocomplete keyword helpers", () => {
  test("getContextualKeywords_AfterWhere_ReturnsPriorityKeywords", () => {
    // Arrange
    const lastKeyword = "where";

    // Act
    const contextualKeywords = getContextualKeywords(lastKeyword);

    // Assert
    expect(contextualKeywords).toContain("AND");
    expect(contextualKeywords).toContain("OR");
    expect(contextualKeywords).toContain("IN");
    expect(contextualKeywords).toContain("NOT");
    expect(contextualKeywords).toContain("LIKE");
    expect(contextualKeywords).toContain("BETWEEN");
  });

  test("getContextualKeywords_AfterGroup_ReturnsPriorityKeywords", () => {
    const contextualKeywords = getContextualKeywords("group");

    expect(contextualKeywords).toContain("HAVING");
    expect(contextualKeywords).toContain("ORDER BY");
  });

  test("getContextualKeywords_AfterOrder_ReturnsPriorityKeywords", () => {
    const contextualKeywords = getContextualKeywords("order");

    expect(contextualKeywords).toContain("ASC");
    expect(contextualKeywords).toContain("DESC");
  });

  test("getContextualKeywords_AfterSelect_ReturnsPriorityKeywords", () => {
    // Arrange
    const lastKeyword = "select";

    // Act
    const contextualKeywords = getContextualKeywords(lastKeyword);

    // Assert
    expect(contextualKeywords).toContain("FROM");
    expect(contextualKeywords).toContain("DISTINCT");
    expect(contextualKeywords).toContain("TOP");
    expect(contextualKeywords).toContain("CASE");
    expect(contextualKeywords).toContain("AS");
  });

  test("getContextualKeywords_AfterFrom_ReturnsPriorityKeywords", () => {
    // Arrange
    const lastKeyword = "from";

    // Act
    const contextualKeywords = getContextualKeywords(lastKeyword);

    // Assert
    expect(contextualKeywords).toContain("WHERE");
    expect(contextualKeywords).toContain("JOIN");
    expect(contextualKeywords).toContain("LEFT");
    expect(contextualKeywords).toContain("RIGHT");
    expect(contextualKeywords).toContain("INNER");
    expect(contextualKeywords).toContain("ON");
  });

  test("getContextualKeywords_AfterJoin_ReturnsPriorityKeywords", () => {
    // Arrange
    const lastKeyword = "join";

    // Act
    const contextualKeywords = getContextualKeywords(lastKeyword);

    // Assert
    expect(contextualKeywords).toContain("ON");
    expect(contextualKeywords).toContain("WHERE");
  });

  test("getContextualKeywords_WithUnknownKeyword_ReturnsEmptyArray", () => {
    // Arrange
    const lastKeyword = "unknown";

    // Act
    const contextualKeywords = getContextualKeywords(lastKeyword);

    // Assert
    expect(contextualKeywords).toEqual([]);
  });

  test("getContextualKeywords_WithNullKeyword_ReturnsEmptyArray", () => {
    // Arrange
    const lastKeyword = null;

    // Act
    const contextualKeywords = getContextualKeywords(lastKeyword);

    // Assert
    expect(contextualKeywords).toEqual([]);
  });
});
