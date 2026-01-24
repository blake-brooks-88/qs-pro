import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { aggregateInWhereRule } from "./aggregate-in-where";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("aggregateInWhereRule", () => {
  describe("violation detection", () => {
    it("should detect COUNT in WHERE clause", () => {
      const sql = "SELECT * FROM A WHERE COUNT(*) > 5";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("COUNT");
      expect(diagnostics[0]?.message).toContain("HAVING");
    });

    it("should detect SUM in WHERE clause", () => {
      const sql = "SELECT * FROM A WHERE SUM(amount) > 100";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("SUM");
    });

    it("should detect AVG in WHERE clause", () => {
      const sql = "SELECT * FROM A WHERE AVG(price) > 50";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect MIN in WHERE clause", () => {
      const sql = "SELECT * FROM A WHERE MIN(value) < 0";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect MAX in WHERE clause", () => {
      const sql = "SELECT * FROM A WHERE MAX(score) > 100";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect multiple aggregates in WHERE", () => {
      const sql = "SELECT * FROM A WHERE COUNT(*) > 5 AND SUM(amount) > 100";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(2);
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass aggregate in HAVING clause", () => {
      const sql = "SELECT type FROM A GROUP BY type HAVING COUNT(*) > 5";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass aggregate in SELECT clause", () => {
      const sql = "SELECT COUNT(*) FROM A";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass WHERE clause without aggregates", () => {
      const sql = "SELECT * FROM A WHERE id = 5";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass aggregate in subquery within WHERE", () => {
      const sql = "SELECT * FROM A WHERE id = (SELECT MAX(id) FROM B)";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag aggregate function name in string", () => {
      const sql = "SELECT * FROM A WHERE name = 'COUNT'";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag aggregate function name in comment", () => {
      const sql = "SELECT * FROM A WHERE id = 1 -- COUNT(*) > 5";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag column named like an aggregate function", () => {
      const sql = "SELECT * FROM A WHERE count = 5";
      const diagnostics = aggregateInWhereRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
