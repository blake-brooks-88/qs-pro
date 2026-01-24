import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { emptyInClauseRule } from "./empty-in-clause";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("emptyInClauseRule", () => {
  describe("violation detection", () => {
    it("should detect empty IN clause", () => {
      const sql = "SELECT * FROM A WHERE id IN ()";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("Empty IN clause");
    });

    it("should detect empty IN clause with whitespace", () => {
      const sql = "SELECT * FROM A WHERE id IN (   )";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect empty NOT IN clause", () => {
      const sql = "SELECT * FROM A WHERE id NOT IN ()";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect multiple empty IN clauses", () => {
      const sql = "SELECT * FROM A WHERE id IN () OR name IN ()";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(2);
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass IN with values", () => {
      const sql = "SELECT * FROM A WHERE id IN (1, 2, 3)";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass IN with string values", () => {
      const sql = "SELECT * FROM A WHERE name IN ('a', 'b')";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass IN with subquery", () => {
      const sql = "SELECT * FROM A WHERE id IN (SELECT id FROM B)";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass IN with single value", () => {
      const sql = "SELECT * FROM A WHERE id IN (1)";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag IN in string literal", () => {
      const sql = "SELECT 'IN ()' FROM A";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag IN in comment", () => {
      const sql = "SELECT * FROM A -- WHERE id IN ()";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag IN in block comment", () => {
      const sql = "SELECT * FROM A /* WHERE id IN () */";
      const diagnostics = emptyInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
