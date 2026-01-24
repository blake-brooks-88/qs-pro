import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { subqueryWithoutAliasRule } from "./subquery-without-alias";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("subqueryWithoutAliasRule", () => {
  describe("violation detection", () => {
    it("should detect subquery in FROM without alias", () => {
      const sql = "SELECT * FROM (SELECT id FROM A)";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("alias");
    });

    it("should detect nested subquery without alias", () => {
      const sql =
        "SELECT * FROM (SELECT * FROM (SELECT id FROM A) AS inner_sub)";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass subquery with AS alias", () => {
      const sql = "SELECT * FROM (SELECT id FROM A) AS sub";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass subquery with implicit alias (no AS keyword)", () => {
      const sql = "SELECT * FROM (SELECT id FROM A) sub";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass subquery with bracketed alias", () => {
      const sql = "SELECT * FROM (SELECT id FROM A) AS [My Sub]";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass IN subquery (no alias needed)", () => {
      const sql = "SELECT * FROM A WHERE id IN (SELECT id FROM B)";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass EXISTS subquery (no alias needed)", () => {
      const sql =
        "SELECT * FROM A WHERE EXISTS (SELECT 1 FROM B WHERE B.id = A.id)";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle nested subqueries with aliases", () => {
      const sql = "SELECT * FROM (SELECT * FROM (SELECT id FROM A) AS x) AS y";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag subquery in comment", () => {
      const sql = "SELECT * FROM A /* (SELECT * FROM B) */";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag subquery in string literal", () => {
      const sql = "SELECT '(SELECT * FROM A)' FROM B";
      const diagnostics = subqueryWithoutAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
