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
      diagnostics.some((diag) => diag.message.includes("not supported")),
    ).toBe(true);
  });

  test("lintSql_WithKeywordInsideBrackets_DoesNotReportProhibitedKeyword", () => {
    // Arrange
    const sql = "SELECT Name FROM [DELETE Me]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - Should not report DELETE as prohibited keyword since it's in brackets
    // May have other warnings (like select-star) but no prohibited keyword error
    expect(
      diagnostics.some((diag) => diag.message.includes("not supported in MCE")),
    ).toBe(false);
  });

  test("lintSql_WithCte_ReturnsWarningDiagnostic", () => {
    // Arrange
    const sql = "WITH cte AS (SELECT Id FROM Users) SELECT * FROM cte";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some((diag) =>
        diag.message.includes("Common Table Expressions"),
      ),
    ).toBe(true);
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
      diagnostics.some((diag) =>
        diag.message.includes("exists in multiple tables"),
      ),
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
      diagnostics.some((diag) =>
        diag.message.includes("exists in multiple tables"),
      ),
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
      diagnostics.some((diag) =>
        diag.message.includes("exists in multiple tables"),
      ),
    ).toBe(true);
  });

  // Task Group 2: Prohibited Keywords & CTE Detection tests
  test("lintSql_WithCreateKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "CREATE TABLE Users (Id INT)";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("not supported"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithExecKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "EXEC sp_procedure @param = 'value'";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("not supported"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithGrantKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "GRANT SELECT ON Users TO Role";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("not supported"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithCursorKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "DECLARE myCursor CURSOR FOR SELECT * FROM Users";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("not supported"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithBackupKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "BACKUP DATABASE MyDB TO DISK = 'backup.bak'";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("not supported"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithIfKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "IF @count > 0 BEGIN SELECT * FROM Users END";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("Variables"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithTryCatchKeywords_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "BEGIN TRY SELECT * FROM Users END TRY BEGIN CATCH END CATCH";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" && diag.message.includes("Variables"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithCteColumnSyntax_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql =
      "WITH cte (col1, col2) AS (SELECT Id, Name FROM Users) SELECT * FROM cte";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.includes("Common Table Expressions"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithMultiCte_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql =
      "WITH cte1 AS (SELECT Id FROM Users), cte2 AS (SELECT Id FROM Orders) SELECT * FROM cte1 JOIN cte2";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.includes("Common Table Expressions"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithLimitKeyword_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "SELECT * FROM Users LIMIT 10";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.includes("LIMIT is not supported") &&
          diag.message.includes("Use TOP"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithOffsetFetchWithOrderBy_IsValid", () => {
    // Arrange - OFFSET/FETCH with ORDER BY is now valid in MCE
    const sql =
      "SELECT Name FROM Users ORDER BY Id OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - Should not have errors for OFFSET (it's valid with ORDER BY)
    // May have warnings but no OFFSET-related errors
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.toLowerCase().includes("offset"),
      ),
    ).toBe(false);
  });

  test("lintSql_WithOffsetWithoutOrderBy_ReturnsError", () => {
    // Arrange - OFFSET without ORDER BY is an error
    const sql = "SELECT Name FROM Users OFFSET 10 ROWS";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - Should have error for OFFSET without ORDER BY
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          (diag.message.includes("OFFSET requires") ||
            diag.message.includes("ORDER BY")),
      ),
    ).toBe(true);
  });

  // Task Group 3: New Linting Rules tests
  test("lintSql_WithUnsupportedFunction_ReturnsErrorDiagnostic", () => {
    // Arrange - STRING_AGG is now supported, use TRY_CONVERT instead
    const sql = "SELECT TRY_CONVERT(INT, Value) FROM [Users]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - unsupported functions are now errors (not warnings)
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.includes("not available in MCE"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithMultipleUnsupportedFunctions_ReturnsMultipleErrors", () => {
    // Arrange
    const sql =
      "SELECT try_convert(INT, Value), json_modify(Data, '$.key', 'val') FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - unsupported functions are now errors (not warnings)
    const unsupportedErrors = diagnostics.filter(
      (diag) =>
        diag.severity === "error" &&
        diag.message.includes("not available in MCE"),
    );
    expect(unsupportedErrors.length).toBeGreaterThanOrEqual(2);
  });

  test("lintSql_WithSupportedJsonFunctions_DoesNotWarn", () => {
    // Arrange
    const sql =
      "SELECT json_value(Data, '$.name'), json_query(Data, '$.items') FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some((diag) => diag.message.includes("not available in MCE")),
    ).toBe(false);
  });

  test("lintSql_WithAggregateWithoutGroupBy_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "SELECT Region, COUNT(*) FROM [Sales]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.includes("must appear in GROUP BY"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithAggregateOnly_DoesNotWarn", () => {
    // Arrange
    const sql = "SELECT COUNT(*) FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.some((diag) => diag.message.includes("GROUP BY"))).toBe(
      false,
    );
  });

  test("lintSql_WithProperGroupBy_DoesNotWarn", () => {
    // Arrange
    const sql = "SELECT Region, COUNT(*) FROM [Table] GROUP BY Region";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.some((diag) => diag.message.includes("GROUP BY"))).toBe(
      false,
    );
  });

  test("lintSql_WithCountDistinct_IsAggregated", () => {
    // Arrange
    const sql = "SELECT COUNT(DISTINCT Region) FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(diagnostics.some((diag) => diag.message.includes("GROUP BY"))).toBe(
      false,
    );
  });

  test("lintSql_WithSelectStarAndAggregate_ReturnsErrorDiagnostic", () => {
    // Arrange
    const sql = "SELECT *, COUNT(*) FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert
    expect(
      diagnostics.some(
        (diag) =>
          diag.severity === "error" &&
          diag.message.includes("must appear in GROUP BY"),
      ),
    ).toBe(true);
  });

  // Task Group 6: Integration Tests
  test("lintSql_WithMultipleRuleViolations_ReturnsAllDiagnostics", () => {
    // Arrange - Complex SQL with multiple violations
    // Note: OFFSET without ORDER BY is an error, and unbracketed names/unsupported functions are now errors
    const sql = `
      SELECT Region, TRY_CONVERT(INT, ID), COUNT(*)
      FROM My Data
      WHERE 1=1
      LIMIT 10
      OFFSET 5 ROWS FETCH NEXT 10 ROWS ONLY
    `;
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

    // Assert - Should detect multiple issues
    const errorDiagnostics = diagnostics.filter(
      (diag) => diag.severity === "error",
    );

    // Unbracketed name error (My Data has spaces and is not bracketed) - upgraded to error
    expect(errorDiagnostics.some((d) => d.message.includes("bracket"))).toBe(
      true,
    );
    // Unsupported function error - now an error
    expect(
      errorDiagnostics.some((d) => d.message.includes("not available in MCE")),
    ).toBe(true);
    // Aggregate GROUP BY error
    expect(errorDiagnostics.some((d) => d.message.includes("GROUP BY"))).toBe(
      true,
    );
    // LIMIT error
    expect(
      errorDiagnostics.some((d) =>
        d.message.includes("LIMIT is not supported"),
      ),
    ).toBe(true);
    // OFFSET without ORDER BY error (new behavior)
    expect(
      errorDiagnostics.some(
        (d) =>
          d.message.includes("OFFSET requires") ||
          d.message.includes("ORDER BY"),
      ),
    ).toBe(true);
  });

  test("lintSql_WithValidComplexQuery_ReturnsNoErrors", () => {
    // Arrange - Valid complex query
    const sql = `
      SELECT
        a.Region,
        a.Category,
        COUNT(DISTINCT a.Id) as UniqueCount,
        SUM(a.Amount) as TotalAmount,
        json_value(a.Metadata, '$.status') as Status
      FROM [Sales Data] a
      LEFT JOIN [Customer Info] b ON a.CustomerId = b.Id
      WHERE a.Region IN ('North', 'South')
        AND a.CreatedDate >= DATEADD(month, -6, GETDATE())
      GROUP BY a.Region, a.Category, json_value(a.Metadata, '$.status')
      ORDER BY SUM(a.Amount) DESC
    `;
    const dataExtensions: DataExtension[] = [
      {
        id: "de-1",
        name: "Sales Data",
        customerKey: "Sales Data",
        folderId: "local",
        description: "",
        fields: [
          { name: "Id", type: "Text", isPrimaryKey: true, isNullable: false },
          {
            name: "Region",
            type: "Text",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "Category",
            type: "Text",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "Amount",
            type: "Decimal",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "CustomerId",
            type: "Text",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "CreatedDate",
            type: "Date",
            isPrimaryKey: false,
            isNullable: true,
          },
          {
            name: "Metadata",
            type: "Text",
            isPrimaryKey: false,
            isNullable: true,
          },
        ],
      },
      {
        id: "de-2",
        name: "Customer Info",
        customerKey: "Customer Info",
        folderId: "local",
        description: "",
        fields: [
          { name: "Id", type: "Text", isPrimaryKey: true, isNullable: false },
        ],
      },
    ];

    // Act
    const diagnostics = lintSql(sql, { dataExtensions });

    // Assert - No errors or warnings (json_value is supported)
    const errorDiagnostics = diagnostics.filter(
      (diag) => diag.severity === "error",
    );
    const warningDiagnostics = diagnostics.filter(
      (diag) => diag.severity === "warning",
    );

    expect(errorDiagnostics).toHaveLength(0);
    expect(warningDiagnostics).toHaveLength(0);
  });

  test("lintSql_WithErrorSeverity_BlocksRunButton", () => {
    // Arrange - Query with error-severity violation
    const sql = "DELETE FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - Verify error severity present (would block RUN button)
    const errorDiagnostics = diagnostics.filter(
      (diag) => diag.severity === "error",
    );
    expect(errorDiagnostics.length).toBeGreaterThan(0);
  });

  test("lintSql_WithWarningSeverity_DoesNotBlockRunButton", () => {
    // Arrange - Query with only warning-severity violations
    // Use SELECT * (single table) and <> operator which are warnings
    const sql = "SELECT * FROM [Table] WHERE Status <> 'Active'";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - Verify only warnings present (should not block RUN button)
    const errorDiagnostics = diagnostics.filter(
      (diag) => diag.severity === "error",
    );
    const warningDiagnostics = diagnostics.filter(
      (diag) => diag.severity === "warning",
    );

    expect(errorDiagnostics).toHaveLength(0);
    expect(warningDiagnostics.length).toBeGreaterThan(0);
  });

  test("lintSql_RegressionTest_ExistingBehaviorUnchanged", () => {
    // Arrange - Test that original rule behavior is unchanged
    const testCases = [
      { sql: "SELECT * FROM Subscribers DELETE FROM Users", expectError: true },
      { sql: "SELECT * FROM [DELETE Me]", expectError: false },
      {
        sql: "WITH cte AS (SELECT Id FROM Users) SELECT * FROM cte",
        expectError: true,
      },
      { sql: "SELECT * FROM #TempTable", expectError: true },
      { sql: "DECLARE @count INT", expectError: true },
    ];

    // Act & Assert
    testCases.forEach(({ sql, expectError }) => {
      const diagnostics = lintSql(sql);

      if (expectError) {
        expect(diagnostics.some((diag) => diag.severity === "error")).toBe(
          true,
        );
      }
    });
  });

  test("lintSql_WithSubqueryAggregates_DoesNotAffectOuterScope", () => {
    // Arrange - Subquery with aggregate in correlated subquery
    // Note: Current implementation may flag this, which is acceptable
    // The outer SELECT doesn't have aggregates, so Name is fine
    const sql = `
      SELECT
        (SELECT COUNT(*) FROM [Orders]) as OrderCount
      FROM [Customers] c
    `;

    // Act
    const diagnostics = lintSql(sql);

    // Assert - No GROUP BY diagnostic since outer SELECT has no mixing
    expect(diagnostics.some((diag) => diag.message.includes("GROUP BY"))).toBe(
      false,
    );
  });

  test("lintSql_WithNestedFunctions_DetectsUnsupportedFunction", () => {
    // Arrange - Nested function call with unsupported function
    const sql = "SELECT UPPER(try_convert(VARCHAR, DateField)) FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - Should detect try_convert even when nested
    expect(
      diagnostics.some((diag) => diag.message.includes("not available in MCE")),
    ).toBe(true);
  });

  test("lintSql_WithLiteralValuesInGrouping_DoesNotRequireGroupBy", () => {
    // Arrange - Only aggregates, no mixing with non-aggregated columns
    const sql = "SELECT COUNT(*) as Count, SUM(Amount) as Total FROM [Table]";

    // Act
    const diagnostics = lintSql(sql);

    // Assert - No GROUP BY needed when only aggregates
    expect(diagnostics.some((diag) => diag.message.includes("GROUP BY"))).toBe(
      false,
    );
  });

  test("lintSql_WithAllNewRules_PipelineWorks", () => {
    // Arrange - Multiple separate SQL queries that trigger all new rules from Task Groups 2 & 3
    // Test each rule individually and verify the linting pipeline aggregates all diagnostics

    // Test prohibited keywords (CREATE)
    const sql1 = "CREATE TABLE temp (id INT)";
    const diag1 = lintSql(sql1);
    expect(diag1.some((diag) => diag.message.includes("read-only"))).toBe(true);

    // Test CTE detection
    const sql2 =
      "WITH cte (col1) AS (SELECT Region FROM [Data]) SELECT * FROM cte";
    const diag2 = lintSql(sql2);
    expect(
      diag2.some((diag) => diag.message.includes("Common Table Expressions")),
    ).toBe(true);

    // Test unsupported functions
    const sql3 = "SELECT try_cast(Value AS INT) FROM [Data]";
    const diag3 = lintSql(sql3);
    expect(
      diag3.some((diag) => diag.message.includes("not available in MCE")),
    ).toBe(true);

    // Test aggregate grouping
    const sql4 = "SELECT Region, COUNT(*) FROM [Data]";
    const diag4 = lintSql(sql4);
    expect(diag4.some((diag) => diag.message.includes("GROUP BY"))).toBe(true);

    // Test LIMIT prohibition
    const sql5 = "SELECT * FROM [Data] LIMIT 100";
    const diag5 = lintSql(sql5);
    expect(
      diag5.some((diag) => diag.message.includes("LIMIT is not supported")),
    ).toBe(true);

    // Test OFFSET without ORDER BY (OFFSET is allowed but requires ORDER BY)
    const sql6 = "SELECT * FROM [Data] OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY";
    const diag6 = lintSql(sql6);
    expect(
      diag6.some(
        (diag) =>
          diag.message.includes("OFFSET requires") ||
          diag.message.includes("ORDER BY"),
      ),
    ).toBe(true);
  });
});
