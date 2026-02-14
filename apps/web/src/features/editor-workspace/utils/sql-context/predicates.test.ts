import { describe, expect, it } from "vitest";

import {
  isAfterComparisonOperator,
  isInsideBrackets,
  isInsideComment,
  isInsideFunctionParens,
  isInsideString,
} from "./predicates";

describe("isInsideString", () => {
  it("returns true when cursor is inside a single-quoted string", () => {
    const sql = "SELECT 'hello ";
    expect(isInsideString(sql, sql.length)).toBe(true);
  });

  it("returns false when cursor is after a closed single-quoted string", () => {
    const sql = "SELECT 'hello' ";
    expect(isInsideString(sql, sql.length)).toBe(false);
  });

  it("returns true when cursor is inside a double-quoted string", () => {
    const sql = 'SELECT "hello ';
    expect(isInsideString(sql, sql.length)).toBe(true);
  });

  it("returns false when cursor is after a closed double-quoted string", () => {
    const sql = 'SELECT "hello" ';
    expect(isInsideString(sql, sql.length)).toBe(false);
  });

  it("treats escaped single quotes as continuation of the string", () => {
    const sql = "SELECT 'it''s ";
    expect(isInsideString(sql, sql.length)).toBe(true);
  });

  it("returns false after an escaped quote followed by a closing quote", () => {
    const sql = "SELECT 'it''s' ";
    expect(isInsideString(sql, sql.length)).toBe(false);
  });

  it("returns false when cursor is at position 0", () => {
    expect(isInsideString("SELECT", 0)).toBe(false);
  });
});

describe("isInsideComment", () => {
  it("returns true when cursor is inside a line comment", () => {
    const sql = "-- this is a comment ";
    expect(isInsideComment(sql, sql.length)).toBe(true);
  });

  it("returns false after a line comment ends with a newline", () => {
    const sql = "-- comment\nSELECT ";
    expect(isInsideComment(sql, sql.length)).toBe(false);
  });

  it("returns true when cursor is inside an unclosed block comment", () => {
    const sql = "/* unclosed block ";
    expect(isInsideComment(sql, sql.length)).toBe(true);
  });

  it("returns false after a closed block comment", () => {
    const sql = "/* closed */ SELECT ";
    expect(isInsideComment(sql, sql.length)).toBe(false);
  });

  it("does not treat comment markers inside a single-quoted string as a comment", () => {
    const sql = "SELECT '-- not a comment' ";
    expect(isInsideComment(sql, sql.length)).toBe(false);
  });

  it("does not treat block comment markers inside a single-quoted string as a comment", () => {
    const sql = "SELECT '/* not a comment */' ";
    expect(isInsideComment(sql, sql.length)).toBe(false);
  });

  it("does not treat comment markers inside a double-quoted string as a comment", () => {
    const sql = 'SELECT "-- not a comment" ';
    expect(isInsideComment(sql, sql.length)).toBe(false);
  });

  it("handles escaped single quotes inside strings before comment markers", () => {
    const sql = "SELECT 'it''s' -- real comment ";
    expect(isInsideComment(sql, sql.length)).toBe(true);
  });
});

describe("isInsideBrackets", () => {
  it("returns true when cursor is inside an unclosed bracket", () => {
    const sql = "SELECT [Name";
    expect(isInsideBrackets(sql, sql.length)).toBe(true);
  });

  it("returns false when cursor is after a closed bracket", () => {
    const sql = "SELECT [Name] ";
    expect(isInsideBrackets(sql, sql.length)).toBe(false);
  });

  it("does not treat brackets inside a single-quoted string as real brackets", () => {
    const sql = "SELECT '[not a bracket' ";
    expect(isInsideBrackets(sql, sql.length)).toBe(false);
  });

  it("does not treat brackets inside a double-quoted string as real brackets", () => {
    const sql = 'SELECT "[not a bracket" ';
    expect(isInsideBrackets(sql, sql.length)).toBe(false);
  });

  it("handles nested bracket depth correctly", () => {
    const sql = "SELECT [[inner";
    expect(isInsideBrackets(sql, sql.length)).toBe(true);
  });

  it("returns false when bracket depth returns to zero", () => {
    const sql = "SELECT [a] [b] ";
    expect(isInsideBrackets(sql, sql.length)).toBe(false);
  });

  it("handles escaped single quotes before brackets", () => {
    const sql = "SELECT 'it''s' [Name";
    expect(isInsideBrackets(sql, sql.length)).toBe(true);
  });
});

describe("isAfterComparisonOperator", () => {
  it("returns true after equals sign", () => {
    expect(isAfterComparisonOperator("field = ", 8)).toBe(true);
  });

  it("returns true after not-equal operator", () => {
    expect(isAfterComparisonOperator("field != ", 9)).toBe(true);
  });

  it("returns true after diamond operator", () => {
    expect(isAfterComparisonOperator("field <> ", 9)).toBe(true);
  });

  it("returns true after less-than-or-equal operator", () => {
    expect(isAfterComparisonOperator("field <= ", 9)).toBe(true);
  });

  it("returns true after greater-than-or-equal operator", () => {
    expect(isAfterComparisonOperator("field >= ", 9)).toBe(true);
  });

  it("returns true after less-than operator", () => {
    expect(isAfterComparisonOperator("field < ", 8)).toBe(true);
  });

  it("returns true after greater-than operator", () => {
    expect(isAfterComparisonOperator("field > ", 8)).toBe(true);
  });

  it("returns false when there is no operator before cursor", () => {
    expect(isAfterComparisonOperator("field ", 6)).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isAfterComparisonOperator("", 0)).toBe(false);
  });

  it("returns true after equals with no trailing space", () => {
    expect(isAfterComparisonOperator("field =", 7)).toBe(true);
  });
});

describe("isInsideFunctionParens", () => {
  it("returns true when cursor is inside function parentheses", () => {
    const sql = "SELECT UPPER(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });

  it("returns false when parentheses follow a SQL keyword like IN", () => {
    const sql = "WHERE x IN(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(false);
  });

  it("returns true for nested function parentheses", () => {
    const sql = "SELECT UPPER(LOWER(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });

  it("returns false after function parentheses are closed", () => {
    const sql = "SELECT UPPER(x) ";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(false);
  });

  it("returns false when open paren has no preceding word", () => {
    const sql = "SELECT (";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(false);
  });

  it("returns false when preceding word is EXISTS", () => {
    const sql = "WHERE EXISTS(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(false);
  });

  it("returns false when preceding word is SELECT", () => {
    const sql = "SELECT(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(false);
  });

  it("returns true when inner paren closes but outer function paren is still open", () => {
    const sql = "SELECT UPPER(LOWER(x) || ";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });

  it("handles single-quoted strings inside function parens", () => {
    const sql = "SELECT UPPER('hello";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });

  it("handles double-quoted strings inside function parens", () => {
    const sql = 'SELECT UPPER("hello"';
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });

  it("recognizes function when preceded by whitespace before the paren", () => {
    const sql = "SELECT UPPER (";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });

  it("returns false for CASE keyword parens", () => {
    const sql = "CASE(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(false);
  });

  it("handles function name at the very start of the string", () => {
    const sql = "UPPER(";
    expect(isInsideFunctionParens(sql, sql.length)).toBe(true);
  });
});
