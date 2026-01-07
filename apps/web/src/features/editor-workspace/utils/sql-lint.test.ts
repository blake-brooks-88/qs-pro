import { describe, expect, test } from "vitest";
import type { DataExtension } from "@/features/editor-workspace/types";
import { lintSql } from "@/features/editor-workspace/utils/sql-lint";

describe("sql lint", () => {
  test("lintSql_WithProhibitedKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "SELECT * FROM Subscribers DELETE FROM Users";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("Not Supported")),
    ).toBe(true);
  });

  test("lintSql_WithKeywordInsideBrackets_DoesNotReport", () => {
    // Arrange
    const sql = "SELECT * FROM [DELETE Me]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.length).toBe(0);
  });

  test("lintSql_WithCte_ReturnsWarningDiagnostic", () => {
    // Arrange
    const sql = "WITH cte AS (SELECT Id FROM Users) SELECT * FROM cte";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.some((diag) => diag.message.includes("CTEs"))).toBe(
      true,
    );
  });

  test("lintSql_WithTempTable_ReturnsWarningDiagnostic", () => {
    // Arrange
    const sql = "SELECT * FROM #TempTable";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("Temp tables")),
    ).toBe(true);
  });

  test("lintSql_WithProceduralKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "DECLARE @count INT";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.some((diag) => diag.message.includes("Variables"))).toBe(
      true,
    );
  });

  test("lintSql_WithMissingSelect_ReturnsPrereqDiagnostic", () => {
    // Arrange
    const sql = "FROM Subscribers";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "prereq" &&
          diag.message.includes("SELECT statement"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithMissingFromForFields_ReturnsPrereqDiagnostic", () => {
    // Arrange
    const sql = "SELECT EmailAddress";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "prereq" && diag.message.includes("FROM clause"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithUnbracketedSpaceName_ReturnsWarningDiagnostic", () => {
    // Arrange
    const sql = "SELECT * FROM My Data";
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

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("wrapped in brackets")),
    ).toBe(true);
  });

  test("lintSql_WithAmbiguousFieldAndMissingAliases_ReturnsError", () => {
    // Arrange
    const sql =
      "SELECT EmailAddress FROM [DE One] JOIN [DE Two] ON [DE One].Id = [DE Two].Id";
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "DE One",
        customerKey: "DE One",
        folderId: "local",
        description: "",
        fields: [
          {
            name: "EmailAddress",
            type: "Email",
            isPrimaryKey: false,
            isNullable: true,
          },
          { name: "Id", type: "Text", isPrimaryKey: false, isNullable: true },
        ],
      },
      {
        id: "de-2",
        name: "DE Two",
        customerKey: "DE Two",
        folderId: "local",
        description: "",
        fields: [
          {
            name: "EmailAddress",
            type: "Email",
            isPrimaryKey: false,
            isNullable: true,
          },
          { name: "Id", type: "Text", isPrimaryKey: false, isNullable: true },
        ],
      },
    ];

    // Act
    const diagnostics = lintSql(sql, { dataExtensions });

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("Ambiguous field")),
    ).toBe(true);
  });

  test("lintSql_WithAmbiguousFieldAndAliases_AllowsQualifiedField", () => {
    // Arrange
    const sql =
      "SELECT a.EmailAddress FROM [DE One] a JOIN [DE Two] b ON a.Id = b.Id";
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "DE One",
        customerKey: "DE One",
        folderId: "local",
        description: "",
        fields: [
          {
            name: "EmailAddress",
            type: "Email",
            isPrimaryKey: false,
            isNullable: true,
          },
          { name: "Id", type: "Text", isPrimaryKey: false, isNullable: true },
        ],
      },
      {
        id: "de-2",
        name: "DE Two",
        customerKey: "DE Two",
        folderId: "local",
        description: "",
        fields: [
          {
            name: "EmailAddress",
            type: "Email",
            isPrimaryKey: false,
            isNullable: true,
          },
          { name: "Id", type: "Text", isPrimaryKey: false, isNullable: true },
        ],
      },
    ];

    // Act
    const diagnostics = lintSql(sql, { dataExtensions });

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("Ambiguous field")),
    ).toBe(false);
  });

  test("lintSql_WithAmbiguousFieldAndAliasesButUnqualified_ReturnsError", () => {
    // Arrange
    const sql =
      "SELECT EmailAddress FROM [DE One] a JOIN [DE Two] b ON a.Id = b.Id";
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "DE One",
        customerKey: "DE One",
        folderId: "local",
        description: "",
        fields: [
          {
            name: "EmailAddress",
            type: "Email",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "Id",
            type: "Text",
            isPrimaryKey: false,
            isNullable: true,
          },
        ],
      },
      {
        id: "de-2",
        name: "DE Two",
        customerKey: "DE Two",
        folderId: "local",
        description: "",
        fields: [
          {
            name: "EmailAddress",
            type: "Email",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "Id",
            type: "Text",
            isPrimaryKey: false,
            isNullable: true,
          },
        ],
      },
    ];

    // Act
    const diagnostics = lintSql(sql, { dataExtensions });

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("Ambiguous field")),
    ).toBe(true);
  });
});
