import { describe, expect, test } from "vitest";
import type { DataExtension } from "@/features/editor-workspace/types";
import { lintSql } from "./index";
import type { LintRule, LintContext } from "./types";
import { prohibitedKeywordsRule } from "./rules/prohibited-keywords";
import { tokenizeSql } from "./utils/tokenizer";

describe("linter infrastructure", () => {
  test("LintRule_InterfaceContract_CheckReturnsArrayOfDiagnostics", () => {
    // Arrange
    const mockRule: LintRule = {
      id: "test-rule",
      name: "Test Rule",
      check: (context: LintContext) => {
        if (context.sql.includes("TEST")) {
          return [
            {
              message: "Test diagnostic",
              severity: "warning",
              startIndex: 0,
              endIndex: 4,
            },
          ];
        }
        return [];
      },
    };

    const context: LintContext = {
      sql: "SELECT * FROM TEST",
      tokens: tokenizeSql("SELECT * FROM TEST"),
      dataExtensions: undefined,
    };

    // Act
    const result = mockRule.check(context);

    // Assert
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("message");
    expect(result[0]).toHaveProperty("severity");
    expect(result[0]).toHaveProperty("startIndex");
    expect(result[0]).toHaveProperty("endIndex");
  });

  test("RuleAggregation_MultipleRules_DiagnosticsAreMerged", () => {
    // Arrange
    const sql = "DELETE FROM Subscribers";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.some((diag) => diag.message.includes("read-only"))).toBe(
      true,
    );
  });

  test("LintContext_Construction_IncludesTokensAndDataExtensions", () => {
    // Arrange
    const sql = "SELECT * FROM [My Data]";
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "My Data",
        customerKey: "My Data",
        folderId: "local",
        description: "",
        fields: [],
      },
    ];

    // Act
    const diagnostics = lintSql(sql, { dataExtensions });

    // Assert - No error, function accepts options correctly
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test("BackwardsCompatibility_OriginalImportPath_StillWorks", async () => {
    // Arrange
    const sql = "SELECT * FROM Subscribers";

    // Act - Import from original path
    const { lintSql: lintSqlOriginal } = await import("../sql-lint");
    const diagnostics = lintSqlOriginal(sql);

    // Assert
    expect(Array.isArray(diagnostics)).toBe(true);
  });

  test("TokenizeSql_UtilityFunction_ProducesTokenArray", () => {
    // Arrange
    const sql = "SELECT * FROM Users";

    // Act
    const tokens = tokenizeSql(sql);

    // Assert
    expect(tokens).toBeInstanceOf(Array);
    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens[0]).toHaveProperty("type");
    expect(tokens[0]).toHaveProperty("value");
    expect(tokens[0]).toHaveProperty("startIndex");
    expect(tokens[0]).toHaveProperty("endIndex");
    expect(tokens[0]).toHaveProperty("depth");
  });

  test("RuleCheck_WithEmptySQL_ReturnsAppropriatePrereqDiagnostics", () => {
    // Arrange
    const sql = "";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.some((diag) => diag.severity === "prereq")).toBe(true);
  });

  test("ProhibitedKeywordsRule_RuleStructure_ConformsToLintRuleInterface", () => {
    // Arrange & Act
    const rule = prohibitedKeywordsRule;

    // Assert
    expect(rule).toHaveProperty("id");
    expect(rule).toHaveProperty("name");
    expect(rule).toHaveProperty("check");
    expect(typeof rule.id).toBe("string");
    expect(typeof rule.name).toBe("string");
    expect(typeof rule.check).toBe("function");
  });
});
