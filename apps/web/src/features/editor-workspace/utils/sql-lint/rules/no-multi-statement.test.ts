import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { noMultiStatementRule } from "./no-multi-statement";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("noMultiStatementRule", () => {
  describe("violation detection", () => {
    it("should detect multiple SELECT statements separated by semicolon", () => {
      const sql = "SELECT * FROM A; SELECT * FROM B";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("single SQL statement");
    });

    it("should detect SELECT followed by WITH statement", () => {
      const sql = "SELECT * FROM A; WITH cte AS (SELECT 1) SELECT * FROM cte";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect multiple statements with newlines", () => {
      const sql = `SELECT * FROM A;
SELECT * FROM B`;
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect multiple statements with tabs and spaces", () => {
      const sql = "SELECT * FROM A;  \t  SELECT * FROM B";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass single SELECT statement", () => {
      const sql = "SELECT * FROM A";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass single SELECT with trailing semicolon", () => {
      const sql = "SELECT * FROM A;";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass semicolon inside string literal", () => {
      const sql = "SELECT 'hello; world' FROM A";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass semicolon inside string with SELECT keyword", () => {
      const sql = "SELECT '; SELECT * FROM B' AS col FROM A";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle escaped quotes in string literals correctly", () => {
      const sql = "SELECT 'It''s a test; SELECT' FROM A";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle multiple escaped quotes", () => {
      const sql = "SELECT 'O''Brien''s; SELECT * FROM B' FROM A";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass semicolon in line comment", () => {
      const sql = "SELECT * FROM A -- this is a comment; SELECT";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass semicolon in block comment", () => {
      const sql = "SELECT * FROM A /* comment; SELECT * FROM B */";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass WITH statement (CTE)", () => {
      const sql = "WITH cte AS (SELECT * FROM A) SELECT * FROM cte";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should detect real semicolon after string with escaped quotes", () => {
      const sql = "SELECT 'It''s' FROM A; SELECT * FROM B";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should handle string ending at semicolon position", () => {
      const sql = "SELECT 'test'; SELECT * FROM A";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
    });

    it("should handle empty string literals", () => {
      const sql = "SELECT '' FROM A; SELECT * FROM B";
      const diagnostics = noMultiStatementRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
    });
  });
});
