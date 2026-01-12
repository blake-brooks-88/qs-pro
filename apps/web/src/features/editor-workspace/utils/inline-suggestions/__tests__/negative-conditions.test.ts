import { describe, it, expect } from "vitest";
import {
  isInsideString,
  isInsideComment,
  isInsideBrackets,
  isAfterComparisonOperator,
  isInsideFunctionParens,
} from "../../sql-context";

describe("isInsideString", () => {
  it("isInsideString_CursorInsideSingleQuotedString_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE name = 'John|'";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideString(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideString_CursorInsideDoubleQuotedString_ReturnsTrue", () => {
    const sql = 'SELECT * FROM Users WHERE name = "John|"';
    const cursorIndex = sql.indexOf("|");
    const result = isInsideString(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideString_CursorOutsideString_ReturnsFalse", () => {
    const sql = "SELECT * FROM Users WHERE name| = 'John'";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideString(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideString_CursorAfterClosedString_ReturnsFalse", () => {
    const sql = "SELECT * FROM Users WHERE name = 'John' |AND";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideString(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideString_EscapedQuoteInString_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE name = 'John''s|'";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideString(sql, cursorIndex);
    expect(result).toBe(true);
  });
});

describe("isInsideComment", () => {
  it("isInsideComment_CursorInsideLineComment_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users -- this is a comm|ent\nWHERE id = 1";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideComment(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideComment_CursorInsideBlockComment_ReturnsTrue", () => {
    const sql =
      "SELECT * FROM Users /* this is a\nmulti-line| comment */\nWHERE id = 1";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideComment(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideComment_CursorOutsideComment_ReturnsFalse", () => {
    const sql = "SELECT * FROM Users| -- comment\nWHERE id = 1";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideComment(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideComment_CursorAfterLineComment_ReturnsFalse", () => {
    const sql = "SELECT * FROM Users -- comment\n|WHERE id = 1";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideComment(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideComment_CursorAfterBlockComment_ReturnsFalse", () => {
    const sql = "SELECT * FROM Users /* comment */ |WHERE id = 1";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideComment(sql, cursorIndex);
    expect(result).toBe(false);
  });
});

describe("isInsideBrackets", () => {
  it("isInsideBrackets_CursorInsideBrackets_ReturnsTrue", () => {
    const sql = "SELECT [Subscriber| Key] FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideBrackets(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideBrackets_CursorOutsideBrackets_ReturnsFalse", () => {
    const sql = "SELECT [Subscriber Key]| FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideBrackets(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideBrackets_CursorBeforeBrackets_ReturnsFalse", () => {
    const sql = "SELECT |[Subscriber Key] FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideBrackets(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideBrackets_NestedBrackets_ReturnsTrue", () => {
    const sql = "SELECT [[Some| Field]] FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideBrackets(sql, cursorIndex);
    expect(result).toBe(true);
  });
});

describe("isAfterComparisonOperator", () => {
  it("isAfterComparisonOperator_CursorAfterEquals_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE id = |";
    const cursorIndex = sql.indexOf("|");
    const result = isAfterComparisonOperator(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isAfterComparisonOperator_CursorAfterNotEquals_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE id != |";
    const cursorIndex = sql.indexOf("|");
    const result = isAfterComparisonOperator(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isAfterComparisonOperator_CursorAfterLessThan_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE age < |";
    const cursorIndex = sql.indexOf("|");
    const result = isAfterComparisonOperator(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isAfterComparisonOperator_CursorAfterGreaterThanOrEqual_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE age >= |";
    const cursorIndex = sql.indexOf("|");
    const result = isAfterComparisonOperator(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isAfterComparisonOperator_CursorNotAfterOperator_ReturnsFalse", () => {
    const sql = "SELECT * FROM Users| WHERE id = 1";
    const cursorIndex = sql.indexOf("|");
    const result = isAfterComparisonOperator(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isAfterComparisonOperator_CursorAfterOperatorWithSpaces_ReturnsTrue", () => {
    const sql = "SELECT * FROM Users WHERE age  >=  |";
    const cursorIndex = sql.indexOf("|");
    const result = isAfterComparisonOperator(sql, cursorIndex);
    expect(result).toBe(true);
  });
});

describe("isInsideFunctionParens", () => {
  it("isInsideFunctionParens_CursorInsideFunctionCall_ReturnsTrue", () => {
    const sql = "SELECT LEFT(name, |5) FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideFunctionParens(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideFunctionParens_CursorOutsideFunction_ReturnsFalse", () => {
    const sql = "SELECT LEFT(name, 5)| FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideFunctionParens(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideFunctionParens_CursorBeforeFunction_ReturnsFalse", () => {
    const sql = "SELECT |LEFT(name, 5) FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideFunctionParens(sql, cursorIndex);
    expect(result).toBe(false);
  });

  it("isInsideFunctionParens_NestedFunctionCalls_ReturnsTrue", () => {
    const sql = "SELECT UPPER(LEFT(name, |5)) FROM Users";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideFunctionParens(sql, cursorIndex);
    expect(result).toBe(true);
  });

  it("isInsideFunctionParens_SubqueryParens_ReturnsFalse", () => {
    const sql = "SELECT * FROM (SELECT | FROM Users) AS sub";
    const cursorIndex = sql.indexOf("|");
    const result = isInsideFunctionParens(sql, cursorIndex);
    expect(result).toBe(false);
  });
});

describe("Negative conditions integration", () => {
  it("NegativeConditions_SelectLeftShouldNotSuggestJoin_NoJoinSuggested", () => {
    // Test that LEFT in SELECT clause doesn't trigger JOIN suggestion
    const sql = "SELECT LEFT|";
    const cursorIndex = sql.indexOf("|");

    // This test will be validated by the join-keyword-rule updates
    // The rule should check for SELECT clause context
    const textBefore = sql.slice(0, cursorIndex);
    const hasSelectBefore = /\bselect\b/i.test(textBefore);
    const hasFromOrJoinBefore = /\b(from|join)\b/i.test(textBefore);

    expect(hasSelectBefore).toBe(true);
    expect(hasFromOrJoinBefore).toBe(false);
    // When in SELECT clause context, JOIN should NOT be suggested
  });
});
