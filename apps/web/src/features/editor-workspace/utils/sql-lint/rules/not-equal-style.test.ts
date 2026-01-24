import { describe, expect, it } from "vitest";

import type { LintContext } from "../types";
import { notEqualStyleRule } from "./not-equal-style";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
});

describe("notEqualStyleRule", () => {
  describe("warning detection", () => {
    it("should warn on <> operator", () => {
      const sql = "SELECT * FROM A WHERE a <> b";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0]?.severity).toBe("warning");
      expect(diagnostics[0]?.message).toContain("!=");
    });

    it("should warn on multiple <> operators", () => {
      const sql = "SELECT * FROM A WHERE a <> b AND c <> d";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(2);
    });
  });

  describe("valid SQL (should pass)", () => {
    it("should pass != operator", () => {
      const sql = "SELECT * FROM A WHERE a != b";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass = operator", () => {
      const sql = "SELECT * FROM A WHERE a = b";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass < and > operators separately", () => {
      const sql = "SELECT * FROM A WHERE a < b AND c > d";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should pass <= and >= operators", () => {
      const sql = "SELECT * FROM A WHERE a <= b AND c >= d";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("should not flag <> in string literal", () => {
      const sql = "SELECT '<>' FROM A";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag <> in comment", () => {
      const sql = "SELECT * FROM A -- WHERE a <> b";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag <> in block comment", () => {
      const sql = "SELECT * FROM A /* WHERE a <> b */";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag <> in bracketed identifier", () => {
      const sql = "SELECT [<>] FROM A";
      const diagnostics = notEqualStyleRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });
});
