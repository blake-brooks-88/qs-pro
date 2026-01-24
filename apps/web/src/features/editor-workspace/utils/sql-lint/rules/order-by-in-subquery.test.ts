import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { orderByInSubqueryRule } from "./order-by-in-subquery";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("orderByInSubqueryRule", () => {
  describe("violation detection", () => {
    it("should detect ORDER BY in subquery without TOP", () => {
      const sql = "SELECT * FROM (SELECT * FROM A ORDER BY id) AS sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("ORDER BY");
      expect(diagnostics[0]?.message).toContain("TOP");
    });

    it("should detect ORDER BY in nested subquery without TOP", () => {
      const sql =
        "SELECT * FROM (SELECT * FROM (SELECT * FROM A ORDER BY id) AS inner_sub) AS outer_sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect ORDER BY in IN subquery without TOP", () => {
      const sql = "SELECT * FROM A WHERE id IN (SELECT id FROM B ORDER BY id)";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass ORDER BY at top level (not in subquery)", () => {
      const sql = "SELECT * FROM A ORDER BY id";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass subquery with TOP and ORDER BY", () => {
      const sql = "SELECT * FROM (SELECT TOP 10 * FROM A ORDER BY id) AS sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass subquery with OFFSET and ORDER BY", () => {
      const sql =
        "SELECT * FROM (SELECT * FROM A ORDER BY id OFFSET 0 ROWS) AS sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass subquery without ORDER BY", () => {
      const sql = "SELECT * FROM (SELECT * FROM A) AS sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag ORDER BY in comment", () => {
      const sql = "SELECT * FROM (SELECT * FROM A /* ORDER BY id */) AS sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag ORDER BY in string literal", () => {
      const sql = "SELECT * FROM (SELECT 'ORDER BY' AS val FROM A) AS sub";
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle multiple subqueries correctly", () => {
      const sql = `
        SELECT * FROM
          (SELECT TOP 5 * FROM A ORDER BY id) AS sub1,
          (SELECT * FROM B) AS sub2
      `;
      const diagnostics = orderByInSubqueryRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
