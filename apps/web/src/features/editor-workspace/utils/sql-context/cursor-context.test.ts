import { describe, expect, it } from "vitest";

import { getSqlCursorContext } from "./cursor-context";

describe("getSqlCursorContext", () => {
  describe("cursorInTableReference", () => {
    it("returns true when cursor is inside a table name range", () => {
      const sql = "SELECT * FROM [Tab";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.cursorInTableReference).toBe(true);
    });

    it("returns false when cursor is past all table name ranges", () => {
      const sql = "SELECT * FROM [Table] WHERE ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.cursorInTableReference).toBe(false);
    });
  });

  describe("hasFromJoinTable", () => {
    it("returns true when a table exists after the FROM keyword", () => {
      const sql = "SELECT * FROM [A] WHERE ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.hasFromJoinTable).toBe(true);
    });

    it("returns false when no table follows the FROM keyword yet", () => {
      const sql = "SELECT * FROM ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.hasFromJoinTable).toBe(false);
    });

    it("returns true when a table exists after a JOIN keyword", () => {
      const sql = "SELECT * FROM [A] JOIN [B] ON ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.hasFromJoinTable).toBe(true);
    });
  });

  describe("cursorInFromJoinTable", () => {
    it("returns true when cursor is inside the FROM table range", () => {
      const sql = "SELECT * FROM [Tab";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.cursorInFromJoinTable).toBe(true);
    });

    it("returns false when cursor is after the FROM table range", () => {
      const sql = "SELECT * FROM [Table] ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.cursorInFromJoinTable).toBe(false);
    });
  });

  describe("multiple tables at different scope depths", () => {
    it("only includes tables at the cursor depth in tablesInScope", () => {
      const sql =
        "SELECT * FROM [Outer] WHERE ID IN (SELECT ID FROM [Inner] WHERE ";
      const context = getSqlCursorContext(sql, sql.length);

      expect(context.cursorDepth).toBe(1);

      const tableNames = context.tablesInScope.map((t) => t.name);
      expect(tableNames).toContain("Inner");
      expect(tableNames).not.toContain("Outer");
    });

    it("includes outer tables when cursor is at depth 0 after subquery closes", () => {
      const sql =
        "SELECT * FROM [Outer] WHERE ID IN (SELECT ID FROM [Inner]) AND ";
      const context = getSqlCursorContext(sql, sql.length);

      expect(context.cursorDepth).toBe(0);
      const tableNames = context.tablesInScope.map((t) => t.name);
      expect(tableNames).toContain("Outer");
    });
  });

  describe("aliasBeforeDot", () => {
    it("returns the alias when cursor is after a dot preceded by an alias", () => {
      const sql = "SELECT t1. FROM [A] t1";
      const cursorIndex = sql.indexOf("t1.") + 3;
      const context = getSqlCursorContext(sql, cursorIndex);
      expect(context.aliasBeforeDot).toBe("t1");
    });

    it("returns null when cursor is not after a dot", () => {
      const sql = "SELECT * FROM [A] ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.aliasBeforeDot).toBeNull();
    });

    it("returns the bracketed alias before a dot", () => {
      const sql = "SELECT [my alias]. FROM [A] [my alias]";
      const cursorIndex = sql.indexOf("[my alias].") + "[my alias].".length;
      const context = getSqlCursorContext(sql, cursorIndex);
      expect(context.aliasBeforeDot).toBe("my alias");
    });

    it("returns null when the alias before dot is ENT", () => {
      const sql = "SELECT * FROM ENT.";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.aliasBeforeDot).toBeNull();
    });
  });

  describe("aliasMap", () => {
    it("maps lowercase alias to its table reference", () => {
      const sql = "SELECT * FROM [MyTable] mt WHERE ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.aliasMap.has("mt")).toBe(true);
      expect(context.aliasMap.get("mt")?.name).toBe("MyTable");
    });
  });

  describe("isAfterSelect", () => {
    it("returns true when cursor is in the SELECT clause", () => {
      const sql = "SELECT ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.isAfterSelect).toBe(true);
    });

    it("returns false when cursor is after FROM", () => {
      const sql = "SELECT * FROM ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.isAfterSelect).toBe(false);
    });
  });

  describe("currentWord", () => {
    it("returns the partial word at the cursor position", () => {
      const sql = "SELECT Em";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.currentWord).toBe("Em");
    });

    it("returns empty string when cursor is after a space", () => {
      const sql = "SELECT ";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.currentWord).toBe("");
    });

    it("returns content inside an unclosed bracket", () => {
      const sql = "SELECT * FROM [My Tab";
      const context = getSqlCursorContext(sql, sql.length);
      expect(context.currentWord).toBe("My Tab");
    });
  });
});
