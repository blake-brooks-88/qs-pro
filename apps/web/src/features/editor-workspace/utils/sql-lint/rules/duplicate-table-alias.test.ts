import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { duplicateTableAliasRule } from "./duplicate-table-alias";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("duplicateTableAliasRule", () => {
  describe("violation detection", () => {
    it("should detect same alias used for multiple tables", () => {
      const sql = "SELECT * FROM A a JOIN B a ON a.id = a.id";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
      expect(diagnostics[0]?.message).toContain("Duplicate table alias");
    });

    it("should detect duplicate alias with case variation", () => {
      const sql = "SELECT * FROM A x JOIN B X ON x.id = X.id";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("error");
    });

    it("should detect multiple duplicate aliases", () => {
      const sql =
        "SELECT * FROM A a JOIN B a JOIN C a ON a.id = a.id AND a.id = a.id";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(2);
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass unique aliases", () => {
      const sql = "SELECT * FROM A a JOIN B b ON a.id = b.id";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass tables without aliases", () => {
      const sql = "SELECT * FROM A JOIN B ON A.id = B.id";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass single table", () => {
      const sql = "SELECT * FROM A a";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should handle bracketed table names with aliases", () => {
      const sql = "SELECT * FROM [Table A] a JOIN [Table B] b ON a.id = b.id";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag alias in string literal", () => {
      const sql = "SELECT 'a' AS val FROM A a";
      const diagnostics = duplicateTableAliasRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
