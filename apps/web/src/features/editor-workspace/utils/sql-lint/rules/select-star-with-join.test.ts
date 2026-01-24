import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { selectStarWithJoinRule } from "./select-star-with-join";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("selectStarWithJoinRule", () => {
  describe("violation detection", () => {
    it("should detect SELECT * with JOIN", () => {
      const sql = "SELECT * FROM A JOIN B ON A.id = B.id";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("SELECT *");
      expect(diagnostics[0]?.message).toContain("JOIN");
    });

    it("should detect SELECT * with LEFT JOIN", () => {
      const sql = "SELECT * FROM A LEFT JOIN B ON A.id = B.id";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect SELECT * with multiple JOINs", () => {
      const sql = "SELECT * FROM A JOIN B ON A.id = B.id JOIN C ON B.id = C.id";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass SELECT * without JOIN (single table)", () => {
      const sql = "SELECT * FROM A";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass qualified table.* with JOIN", () => {
      const sql = "SELECT A.*, B.name FROM A JOIN B ON A.id = B.id";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass explicit columns with JOIN", () => {
      const sql = "SELECT A.id, B.name FROM A JOIN B ON A.id = B.id";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag JOIN keyword in string literal", () => {
      const sql = "SELECT 'JOIN' AS word FROM A";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag JOIN keyword in comment", () => {
      const sql = "SELECT * FROM A -- JOIN B";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag JOIN keyword in block comment", () => {
      const sql = "SELECT * FROM A /* JOIN B ON A.id = B.id */";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle bracketed identifiers", () => {
      const sql =
        "SELECT * FROM [Table A] JOIN [Table B] ON [Table A].id = [Table B].id";
      const diagnostics = selectStarWithJoinRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });
});
