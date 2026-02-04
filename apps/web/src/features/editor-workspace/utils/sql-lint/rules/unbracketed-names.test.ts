import { describe, expect, it } from "vitest";

import type { DataExtension } from "@/features/editor-workspace/types";
import { assertDefined } from "@/test-utils";

import type { LintContext } from "../types";
import { unbracketedNamesRule } from "./unbracketed-names";

const createContext = (
  sql: string,
  dataExtensions?: DataExtension[],
): LintContext => ({
  sql,
  tokens: [],
  dataExtensions,
});

const createDE = (name: string, customerKey?: string): DataExtension => ({
  id: `de-${name}`,
  name,
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Empty customerKey should use name
  customerKey: customerKey || name,
  folderId: "folder-1",
  description: "",
  fields: [],
  isShared: false,
});

describe("unbracketedNamesRule", () => {
  describe("high-confidence detection (3+ words)", () => {
    it("should detect 3-word unbracketed name without metadata", () => {
      const sql = "SELECT * FROM My Data Extension";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("FROM [My Data Extension]");
    });

    it("should detect 3-word name with metadata for better suggestion", () => {
      const sql = "SELECT * FROM My Data Extension";
      const diagnostics = unbracketedNamesRule.check(
        createContext(sql, [createDE("My Data Extension")]),
      );

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("[My Data Extension]");
    });

    it("should detect 4+ word names", () => {
      const sql = "SELECT * FROM My Very Long Data Extension Name";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
    });
  });

  describe("hyphenated names (valid, no error)", () => {
    it("should NOT flag hyphenated names", () => {
      const sql = "SELECT * FROM Customer-Data";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should NOT flag multi-hyphen names", () => {
      const sql = "SELECT * FROM My-Data-Extension";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("metadata-driven detection (2 words)", () => {
    it("should detect 2-word name when it matches metadata", () => {
      const sql = "SELECT * FROM My Data";
      const diagnostics = unbracketedNamesRule.check(
        createContext(sql, [createDE("My Data")]),
      );

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("[My Data]");
    });

    it("should match by customerKey", () => {
      const sql = "SELECT * FROM Customer Key";
      const diagnostics = unbracketedNamesRule.check(
        createContext(sql, [createDE("Display Name", "Customer Key")]),
      );

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.message).toContain("[Display Name]");
    });

    it("should NOT detect 2-word name without matching metadata", () => {
      const sql = "SELECT * FROM Contacts c";
      const diagnostics = unbracketedNamesRule.check(
        createContext(sql, [createDE("Other Table")]),
      );

      expect(diagnostics).toHaveLength(0);
    });

    it("should NOT detect 2-word name with no metadata", () => {
      const sql = "SELECT * FROM Contacts c";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("dot-qualified names", () => {
    it("should NOT flag dbo.Table", () => {
      const sql = "SELECT * FROM dbo.Table";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should NOT flag schema.table patterns", () => {
      const sql = "SELECT * FROM myschema.mytable";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("ENT. prefix handling", () => {
    it("should detect ENT.Multi Word Name", () => {
      const sql = "SELECT * FROM ENT.My Data Extension";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("ENT.[My Data Extension]");
    });

    it("should NOT flag ENT.SingleWord", () => {
      const sql = "SELECT * FROM ENT.Contacts";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should NOT flag ENT.[Bracketed Name]", () => {
      const sql = "SELECT * FROM ENT.[My Data Extension]";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("bracketed names (should not flag)", () => {
    it("should NOT flag bracketed names", () => {
      const sql = "SELECT * FROM [My Data Extension]";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should NOT flag bracketed names with hyphens", () => {
      const sql = "SELECT * FROM [My-Data-Extension]";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("subqueries (should not flag)", () => {
    it("should NOT flag subqueries", () => {
      const sql = "SELECT * FROM (SELECT id FROM [Table]) sub";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("JOIN handling", () => {
    it("should detect unbracketed names after JOIN", () => {
      const sql =
        "SELECT * FROM [Table1] JOIN My Data Extension ON [Table1].id = My Data Extension.id";
      const diagnostics = unbracketedNamesRule.check(createContext(sql));

      expect(diagnostics.length).toBeGreaterThan(0);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
    });
  });

  describe("case insensitivity", () => {
    it("should match metadata case-insensitively", () => {
      const sql = "SELECT * FROM my data";
      const diagnostics = unbracketedNamesRule.check(
        createContext(sql, [createDE("MY DATA")]),
      );

      expect(diagnostics).toHaveLength(1);
    });
  });

  describe("empty/edge cases", () => {
    it("should return empty array for empty SQL", () => {
      const diagnostics = unbracketedNamesRule.check(createContext(""));
      expect(diagnostics).toHaveLength(0);
    });

    it("should return empty array for SQL without FROM/JOIN", () => {
      const diagnostics = unbracketedNamesRule.check(createContext("SELECT 1"));
      expect(diagnostics).toHaveLength(0);
    });
  });
});
