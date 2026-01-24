import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { notInSubqueryRule } from "./not-in-subquery";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("notInSubqueryRule", () => {
  describe("warning detection", () => {
    it("should warn on NOT IN with subquery", () => {
      const sql = "SELECT * FROM A WHERE id NOT IN (SELECT id FROM B)";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("warning");
      expect(diagnostics[0]?.message).toContain("NULL");
      expect(diagnostics[0]?.message).toContain("NOT EXISTS");
    });

    it("should warn on NOT IN with complex subquery", () => {
      const sql =
        "SELECT * FROM A WHERE id NOT IN (SELECT id FROM B WHERE status = 'active')";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("warning");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass IN with subquery (not NOT IN)", () => {
      const sql = "SELECT * FROM A WHERE id IN (SELECT id FROM B)";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass NOT IN with literal values", () => {
      const sql = "SELECT * FROM A WHERE id NOT IN (1, 2, 3)";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass NOT EXISTS as recommended alternative", () => {
      const sql =
        "SELECT * FROM A WHERE NOT EXISTS (SELECT 1 FROM B WHERE B.id = A.id)";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass query without NOT IN", () => {
      const sql = "SELECT * FROM A WHERE id = 1";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag NOT IN in string literal", () => {
      const sql = "SELECT 'NOT IN (SELECT 1)' FROM A";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag NOT IN in comment", () => {
      const sql = "SELECT * FROM A -- WHERE id NOT IN (SELECT id FROM B)";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag NOT IN in block comment", () => {
      const sql = "SELECT * FROM A /* WHERE id NOT IN (SELECT id FROM B) */";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle case insensitivity", () => {
      const sql = "SELECT * FROM A WHERE id not in (select id from B)";
      const diagnostics = notInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("warning");
    });
  });
});
