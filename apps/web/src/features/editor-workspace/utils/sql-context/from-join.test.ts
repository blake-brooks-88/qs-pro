import { describe, expect, it } from "vitest";

import { isAtEndOfBracketedTableInFromJoin } from "./from-join";

describe("isAtEndOfBracketedTableInFromJoin", () => {
  it("returns false when there is no opening bracket before cursor", () => {
    const sql = "SELECT * FROM Table";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(false);
  });

  it("returns false when brackets are empty", () => {
    const sql = "SELECT * FROM [";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(false);
  });

  it("returns true when cursor is inside a bracketed table after FROM", () => {
    const sql = "SELECT * FROM [Tabl";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(true);
  });

  it("returns false when a SQL keyword appears between FROM and bracket", () => {
    const sql = "SELECT * FROM WHERE [Tabl";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(false);
  });

  it("skips characters inside single quotes during backward scan", () => {
    const sql = "FROM [It's";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(false);
  });

  it("returns true when cursor is inside a bracketed table after JOIN", () => {
    const sql = "SELECT * FROM [A] JOIN [Tab";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(true);
  });

  it("returns false when there is no FROM or JOIN before the bracket", () => {
    const sql = "SELECT [Col";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(false);
  });

  it("handles nested brackets by tracking bracket depth", () => {
    const sql =
      "SELECT * FROM [A] WHERE [x] = 1 AND [y] IN (SELECT z FROM [Tab";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(true);
  });

  it("skips characters inside double quotes during backward scan", () => {
    const sql = 'FROM "text" [Tab';
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(true);
  });

  it("returns false when only non-word tokens exist before bracket", () => {
    const sql = "... [Tab";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(false);
  });

  it("handles alias words between FROM/JOIN and bracket without treating them as keywords", () => {
    const sql = "SELECT * FROM mytable JOIN [New";
    expect(isAtEndOfBracketedTableInFromJoin(sql, sql.length)).toBe(true);
  });
});
