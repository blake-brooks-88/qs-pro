import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { selfJoinSameAliasRule } from "./self-join-same-alias";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("selfJoinSameAliasRule", () => {
  describe("violation detection", () => {
    it("should detect self-join with same alias", () => {
      const sql =
        "SELECT * FROM [Employees] a JOIN [Employees] a ON a.id = a.manager_id";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("Self-join");
    });

    it("should detect self-join without any alias", () => {
      const sql =
        "SELECT * FROM Employees JOIN Employees ON Employees.id = Employees.manager_id";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect self-join with case-insensitive same alias", () => {
      const sql = "SELECT * FROM A x JOIN A X ON x.id = X.parent";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass self-join with different aliases", () => {
      const sql =
        "SELECT * FROM Employees a JOIN Employees b ON a.id = b.manager_id";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass join of different tables", () => {
      const sql = "SELECT * FROM A a JOIN B b ON a.id = b.id";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass single table query", () => {
      const sql = "SELECT * FROM Employees";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle bracketed table names", () => {
      const sql =
        "SELECT * FROM [Employees] e1 JOIN [Employees] e2 ON e1.id = e2.manager_id";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should normalize table names for comparison", () => {
      const sql =
        "SELECT * FROM employees a JOIN EMPLOYEES b ON a.id = b.manager_id";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("UNION/set operations (should NOT flag as self-join)", () => {
    it("should allow same table in UNION without aliases", () => {
      const sql =
        "SELECT email FROM [Master_Subscriber] UNION SELECT email FROM [Master_Subscriber]";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should allow same table in UNION ALL without aliases", () => {
      const sql =
        "SELECT email FROM [Master_Subscriber] UNION ALL SELECT email FROM [Master_Subscriber]";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should allow same table in INTERSECT without aliases", () => {
      const sql =
        "SELECT email FROM [Master_Subscriber] INTERSECT SELECT email FROM [Master_Subscriber]";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should allow same table in EXCEPT without aliases", () => {
      const sql =
        "SELECT email FROM [Master_Subscriber] EXCEPT SELECT email FROM [Master_Subscriber]";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should allow multiple UNIONs with same table", () => {
      const sql =
        "SELECT email FROM [A] UNION SELECT email FROM [A] UNION SELECT email FROM [A]";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should still detect self-join within single SELECT of UNION", () => {
      const sql = "SELECT * FROM [A] JOIN [A] ON 1=1 UNION SELECT * FROM [B]";
      const diagnostics = selfJoinSameAliasRule.check(createContext(sql));

      // Self-join in first SELECT should still be flagged
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.message).toContain("Self-join");
    });
  });
});
