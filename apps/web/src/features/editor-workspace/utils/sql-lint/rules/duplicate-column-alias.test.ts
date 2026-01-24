import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { duplicateColumnAliasRule } from "./duplicate-column-alias";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("duplicateColumnAliasRule", () => {
  describe("violation detection", () => {
    it("should detect duplicate AS column alias", () => {
      const sql = "SELECT a AS x, b AS x FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("Duplicate column alias");
    });

    it("should detect multiple duplicate aliases", () => {
      const sql = "SELECT a AS x, b AS x, c AS x FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(2);
    });

    it("should detect duplicate aliases case-insensitively", () => {
      const sql = "SELECT a AS Name, b AS NAME FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect duplicate bracketed aliases", () => {
      const sql = "SELECT a AS [Total], b AS [Total] FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass unique column aliases", () => {
      const sql = "SELECT a AS x, b AS y FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass columns without aliases", () => {
      const sql = "SELECT a, b, c FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass single column with alias", () => {
      const sql = "SELECT COUNT(*) AS total FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag alias in comment", () => {
      const sql = "SELECT a AS x /* AS x */ FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag alias in line comment", () => {
      const sql = "SELECT a AS x -- AS x\n FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle aggregate functions with implicit alias", () => {
      const sql = "SELECT SUM(amount) total, COUNT(*) total FROM T";
      const diagnostics = duplicateColumnAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
    });
  });
});
