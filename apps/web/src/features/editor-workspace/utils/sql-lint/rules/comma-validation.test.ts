import { describe, expect, test } from "vitest";
import { commaValidationRule } from "./comma-validation";
import { tokenizeSql } from "../utils/tokenizer";

const checkRule = (sql: string) => {
  const tokens = tokenizeSql(sql);
  return commaValidationRule.check({ sql, tokens });
};

describe("commaValidationRule", () => {
  describe("trailing commas before keywords", () => {
    test("lintSql_WithTrailingCommaBeforeFrom_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, b, FROM [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before FROM");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaBeforeWhere_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, WHERE x = 1");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before WHERE");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaBeforeGroupBy_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, GROUP BY a");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before GROUP");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaBeforeOrderBy_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, ORDER BY a");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before ORDER");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaBeforeHaving_ReturnsError", () => {
      const diagnostics = checkRule("SELECT COUNT(*), HAVING COUNT(*) > 1");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before HAVING");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaBeforeJoin_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, INNER JOIN [T2] ON 1=1");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before INNER");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaBeforeUnion_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, UNION SELECT b");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before UNION");
      expect(diagnostics[0].severity).toBe("error");
    });
  });

  describe("leading commas", () => {
    test("lintSql_WithLeadingCommaInSelect_ReturnsError", () => {
      const diagnostics = checkRule("SELECT , a FROM [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Missing column before comma");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithLeadingCommaAfterSelectWithWhitespace_ReturnsError", () => {
      const diagnostics = checkRule("SELECT \n  , a FROM [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Missing column before comma");
      expect(diagnostics[0].severity).toBe("error");
    });
  });

  describe("double commas", () => {
    test("lintSql_WithDoubleComma_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a,, b FROM [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Double comma");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithDoubleCommaWithWhitespace_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a, , b FROM [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Double comma");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithDoubleCommaWithNewline_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a,\n, b FROM [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Double comma");
      expect(diagnostics[0].severity).toBe("error");
    });
  });

  describe("trailing commas in clauses", () => {
    test("lintSql_WithTrailingCommaInGroupBy_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a FROM [T] GROUP BY a, b,");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Trailing comma");
      expect(diagnostics[0].message).toContain("GROUP BY");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaInOrderBy_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a FROM [T] ORDER BY a,");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Trailing comma");
      expect(diagnostics[0].message).toContain("ORDER BY");
      expect(diagnostics[0].severity).toBe("error");
    });

    test("lintSql_WithTrailingCommaInOrderByWithWhitespace_ReturnsError", () => {
      const diagnostics = checkRule("SELECT a FROM [T] ORDER BY a, b, \n");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("Trailing comma");
      expect(diagnostics[0].message).toContain("ORDER BY");
      expect(diagnostics[0].severity).toBe("error");
    });
  });

  describe("valid comma usage", () => {
    test("lintSql_WithValidCommas_ReturnsNoError", () => {
      const diagnostics = checkRule("SELECT a, b, c FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithValidCommasInGroupBy_ReturnsNoError", () => {
      const diagnostics = checkRule("SELECT a, b FROM [T] GROUP BY a, b");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithValidCommasInOrderBy_ReturnsNoError", () => {
      const diagnostics = checkRule("SELECT a FROM [T] ORDER BY a, b");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithValidComplexQuery_ReturnsNoError", () => {
      const diagnostics = checkRule(
        "SELECT a, b, c FROM [T] WHERE x = 1 GROUP BY a, b ORDER BY a, b",
      );
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("commas in special contexts", () => {
    test("lintSql_WithCommaInsideString_IgnoresIt", () => {
      const diagnostics = checkRule("SELECT 'a, b,' FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCommaInsideBrackets_IgnoresIt", () => {
      const diagnostics = checkRule("SELECT [Field,Name] FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCommaInsideDoubleQuotes_IgnoresIt", () => {
      const diagnostics = checkRule('SELECT "Field,Name" FROM [T]');
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCommaInLineComment_IgnoresIt", () => {
      const diagnostics = checkRule(
        "SELECT a -- comment with , comma\n FROM [T]",
      );
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCommaInBlockComment_IgnoresIt", () => {
      const diagnostics = checkRule(
        "SELECT a /* comment with , comma */ FROM [T]",
      );
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCommaInFunctionCall_IgnoresIt", () => {
      const diagnostics = checkRule("SELECT CONCAT(a, b) FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCommaInSubquery_IgnoresIt", () => {
      const diagnostics = checkRule(
        "SELECT a FROM [T] WHERE x IN (SELECT y, z FROM [T2])",
      );
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithTrailingCommaInSubquery_IgnoresIt", () => {
      // Trailing comma inside subquery should be ignored at depth 0 check
      const diagnostics = checkRule("SELECT (SELECT a, FROM [T2]) FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    test("lintSql_WithMultipleErrors_ReturnsAllErrors", () => {
      const diagnostics = checkRule("SELECT a,, b, FROM [T]");
      expect(diagnostics.length).toBeGreaterThan(0);
      // Should detect both double comma and trailing comma before FROM
      const hasDoubleComma = diagnostics.some((d) =>
        d.message.includes("Double comma"),
      );
      const hasTrailingComma = diagnostics.some((d) =>
        d.message.includes("Trailing comma"),
      );
      expect(hasDoubleComma).toBe(true);
      expect(hasTrailingComma).toBe(true);
    });

    test("lintSql_WithEmptySelect_NoError", () => {
      const diagnostics = checkRule("SELECT FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithCaseInsensitiveKeywords_ReturnsError", () => {
      const diagnostics = checkRule("select a, from [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before FROM");
    });

    test("lintSql_WithMixedCaseKeywords_ReturnsError", () => {
      const diagnostics = checkRule("SeLeCt a, FrOm [T]");
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("comma before FROM");
    });

    test("lintSql_WithNestedSubqueriesAndCommas_ReturnsNoError", () => {
      const diagnostics = checkRule(
        "SELECT a, b FROM (SELECT x, y FROM (SELECT m, n FROM [T3])) WHERE c = 1",
      );
      expect(diagnostics).toHaveLength(0);
    });

    test("lintSql_WithEscapedQuoteInString_IgnoresComma", () => {
      const diagnostics = checkRule("SELECT 'O''Reilly, Books' FROM [T]");
      expect(diagnostics).toHaveLength(0);
    });
  });
});
