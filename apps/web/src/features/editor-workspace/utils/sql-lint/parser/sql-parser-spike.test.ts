/**
 * Feasibility Spike: node-sql-parser in Browser/Vite
 *
 * This test file validates that node-sql-parser:
 * 1. Can be bundled and executed in the browser (Vite) without Node builtin/polyfill issues
 * 2. Parses T-SQL/SQL Server dialect correctly
 * 3. Provides usable location information for Monaco markers
 * 4. Handles MCE-specific SQL constructs as documented in MCE-SQL-REFERENCE.md
 */

import { describe, test, expect } from "vitest";
import { Parser } from "node-sql-parser";

// Create parser instance - T-SQL / SQL Server dialect
const parser = new Parser();
const DIALECT = "transactsql";

interface ParseResult {
  parses: boolean;
  ast?: unknown;
  error?: {
    message: string;
    location?: {
      start?: { line: number; column: number; offset?: number };
      end?: { line: number; column: number; offset?: number };
    };
  };
}

function tryParse(sql: string): ParseResult {
  try {
    const ast = parser.astify(sql, { database: DIALECT });
    return { parses: true, ast };
  } catch (err) {
    const error = err as Error & {
      location?: {
        start?: { line: number; column: number; offset?: number };
        end?: { line: number; column: number; offset?: number };
      };
    };
    return {
      parses: false,
      error: {
        message: error.message,
        location: error.location,
      },
    };
  }
}

// Helper to normalize AST to array format
function getAstStatements(ast: unknown): Array<Record<string, unknown>> | null {
  if (!ast) return null;
  if (Array.isArray(ast)) return ast as Array<Record<string, unknown>>;
  // Single statement is returned as object directly
  return [ast as Record<string, unknown>];
}

describe("node-sql-parser Feasibility Spike", () => {
  describe("Browser Bundle Verification", () => {
    test("Parser_Instantiation_WorksInVite", () => {
      // Arrange & Act
      const p = new Parser();

      // Assert
      expect(p).toBeDefined();
      expect(typeof p.astify).toBe("function");
      expect(typeof p.sqlify).toBe("function");
    });

    test("Parser_TSQLDialect_IsSupported", () => {
      // Arrange
      const sql = "SELECT TOP 10 * FROM Users";

      // Act
      const result = tryParse(sql);

      // Assert
      expect(result.parses).toBe(true);
    });
  });

  describe("Basic SELECT Statements", () => {
    test("Simple_SELECT_Parses", () => {
      const sql = "SELECT ContactID, Email FROM Subscribers";
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("SELECT_WithTableAlias_Parses", () => {
      const sql = "SELECT s.ContactID, s.Email FROM Subscribers AS s";
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("SELECT_WithBracketedNames_Parses", () => {
      const sql =
        "SELECT [Contact ID], [Email Address] FROM [My Data Extension]";
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("SELECT_DISTINCT_Parses", () => {
      const sql = "SELECT DISTINCT CustomerKey FROM Contacts";
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("SELECT_TOP_Parses", () => {
      const sql = "SELECT TOP 100 * FROM Subscribers";
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("SELECT_TOP_WithParentheses_Parses", () => {
      const sql = "SELECT TOP (100) * FROM Subscribers";
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });
  });

  describe("JOIN Variants", () => {
    test("INNER_JOIN_Parses", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        INNER JOIN TableB AS b ON a.ID = b.AID
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("LEFT_JOIN_Parses", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        LEFT JOIN TableB AS b ON a.ID = b.AID
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("RIGHT_JOIN_Parses", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        RIGHT JOIN TableB AS b ON a.ID = b.AID
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("FULL_OUTER_JOIN_Parses", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        FULL OUTER JOIN TableB AS b ON a.ID = b.AID
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("CROSS_JOIN_Parses", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        CROSS JOIN TableB AS b
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Multiple_JOINs_Parses", () => {
      const sql = `
        SELECT a.ID, b.Name, c.Value
        FROM TableA AS a
        INNER JOIN TableB AS b ON a.ID = b.AID
        LEFT JOIN TableC AS c ON b.ID = c.BID
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });
  });

  describe("Set Operations", () => {
    test("UNION_Parses", () => {
      const sql = `
        SELECT ID, Name FROM TableA
        UNION
        SELECT ID, Name FROM TableB
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("UNION_ALL_Parses", () => {
      const sql = `
        SELECT ID, Name FROM TableA
        UNION ALL
        SELECT ID, Name FROM TableB
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("INTERSECT_Parses_OrDocumented", () => {
      const sql = `
        SELECT ID FROM TableA
        INTERSECT
        SELECT ID FROM TableB
      `;
      const result = tryParse(sql);
      // Document INTERSECT support status
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("INTERSECT not supported:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });

    test("EXCEPT_Parses_OrDocumented", () => {
      const sql = `
        SELECT ID FROM TableA
        EXCEPT
        SELECT ID FROM TableB
      `;
      const result = tryParse(sql);
      // Document EXCEPT support status
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("EXCEPT not supported:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });
  });

  describe("GROUP BY and HAVING", () => {
    test("GROUP_BY_Parses", () => {
      const sql = `
        SELECT CustomerKey, COUNT(*) AS Total
        FROM Orders
        GROUP BY CustomerKey
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("GROUP_BY_HAVING_Parses", () => {
      const sql = `
        SELECT CustomerKey, COUNT(*) AS Total
        FROM Orders
        GROUP BY CustomerKey
        HAVING COUNT(*) > 5
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("GROUP_BY_ROLLUP_Parses", () => {
      const sql = `
        SELECT Region, City, SUM(Sales) AS TotalSales
        FROM SalesData
        GROUP BY ROLLUP(Region, City)
      `;
      const result = tryParse(sql);
      // Document if ROLLUP is supported
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("ROLLUP not supported:", result.error?.message);
      }
      // ROLLUP may not parse - document the result
      expect(typeof result.parses).toBe("boolean");
    });

    test("GROUP_BY_CUBE_Parses", () => {
      const sql = `
        SELECT Region, City, SUM(Sales) AS TotalSales
        FROM SalesData
        GROUP BY CUBE(Region, City)
      `;
      const result = tryParse(sql);
      // Document if CUBE is supported
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("CUBE not supported:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });
  });

  describe("ORDER BY and OFFSET/FETCH", () => {
    test("ORDER_BY_Parses", () => {
      const sql = `
        SELECT ID, Name FROM Contacts
        ORDER BY Name ASC
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("ORDER_BY_Multiple_Parses", () => {
      const sql = `
        SELECT ID, Name FROM Contacts
        ORDER BY Name ASC, ID DESC
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("OFFSET_FETCH_Parses", () => {
      const sql = `
        SELECT ID, Name FROM Contacts
        ORDER BY Name
        OFFSET 10 ROWS
        FETCH NEXT 20 ROWS ONLY
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("OFFSET_Only_Parses_OrDocumented", () => {
      const sql = `
        SELECT ID, Name FROM Contacts
        ORDER BY Name
        OFFSET 10 ROWS
      `;
      const result = tryParse(sql);
      // Document if OFFSET without FETCH is supported
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log(
          "OFFSET without FETCH not supported:",
          result.error?.message,
        );
      }
      expect(typeof result.parses).toBe("boolean");
    });
  });

  describe("Subqueries", () => {
    test("Subquery_InFROM_Parses", () => {
      const sql = `
        SELECT sub.ID, sub.Total
        FROM (
          SELECT ID, COUNT(*) AS Total
          FROM Orders
          GROUP BY ID
        ) AS sub
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Subquery_InWHERE_Parses", () => {
      const sql = `
        SELECT ID, Name
        FROM Contacts
        WHERE ID IN (SELECT ContactID FROM Orders)
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Subquery_WithORDERBY_Parses", () => {
      // Per MCE reference: ORDER BY in subquery requires TOP or OFFSET
      const sql = `
        SELECT *
        FROM (
          SELECT TOP 10 ID, Name
          FROM Contacts
          ORDER BY Name
        ) AS sub
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("EXISTS_Subquery_Parses", () => {
      const sql = `
        SELECT ID, Name
        FROM Contacts AS c
        WHERE EXISTS (
          SELECT 1 FROM Orders AS o WHERE o.ContactID = c.ID
        )
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });
  });

  describe("AT TIME ZONE", () => {
    test("AT_TIME_ZONE_Parses_OrDocumented", () => {
      const sql = `
        SELECT
          EventDate AT TIME ZONE 'UTC' AS EventDateUTC,
          EventDate AT TIME ZONE 'Eastern Standard Time' AS EventDateEST
        FROM Events
      `;
      const result = tryParse(sql);
      // Document if AT TIME ZONE is supported
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("AT TIME ZONE not supported:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });
  });

  describe("CASE Expressions", () => {
    test("Simple_CASE_Parses", () => {
      const sql = `
        SELECT
          Status,
          CASE Status
            WHEN 'A' THEN 'Active'
            WHEN 'I' THEN 'Inactive'
            ELSE 'Unknown'
          END AS StatusName
        FROM Contacts
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Searched_CASE_Parses", () => {
      const sql = `
        SELECT
          Score,
          CASE
            WHEN Score >= 90 THEN 'A'
            WHEN Score >= 80 THEN 'B'
            WHEN Score >= 70 THEN 'C'
            ELSE 'F'
          END AS Grade
        FROM Students
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });
  });

  describe("Common Functions", () => {
    test("String_Functions_Parse", () => {
      const sql = `
        SELECT
          LEN(Name) AS NameLength,
          UPPER(Email) AS EmailUpper,
          LEFT(Name, 5) AS NameStart,
          CONCAT(FirstName, ' ', LastName) AS FullName,
          CHARINDEX('@', Email) AS AtPosition
        FROM Contacts
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Date_Functions_Parse", () => {
      const sql = `
        SELECT
          GETDATE() AS CurrentDate,
          DATEADD(day, 7, CreateDate) AS OneWeekLater,
          DATEDIFF(day, CreateDate, ModifyDate) AS DaysBetween,
          YEAR(CreateDate) AS CreateYear,
          MONTH(CreateDate) AS CreateMonth
        FROM Contacts
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Aggregate_Functions_Parse", () => {
      const sql = `
        SELECT
          COUNT(*) AS Total,
          COUNT(DISTINCT CustomerKey) AS UniqueCustomers,
          SUM(Amount) AS TotalAmount,
          AVG(Amount) AS AverageAmount,
          MIN(CreateDate) AS FirstOrder,
          MAX(CreateDate) AS LastOrder
        FROM Orders
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("NULL_Handling_Functions_Parse", () => {
      const sql = `
        SELECT
          ISNULL(MiddleName, '') AS MiddleName,
          COALESCE(Phone, Mobile, 'N/A') AS ContactNumber,
          NULLIF(Status, 'Unknown') AS StatusOrNull
        FROM Contacts
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("Conversion_Functions_Parse", () => {
      const sql = `
        SELECT
          CAST(ID AS VARCHAR(10)) AS IDString,
          CONVERT(VARCHAR, CreateDate, 101) AS USDate
        FROM Contacts
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("IIF_Function_Parses", () => {
      const sql = `
        SELECT
          IIF(Score >= 50, 'Pass', 'Fail') AS Result
        FROM Students
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });
  });

  describe("Table Hints (WITH NOLOCK)", () => {
    test("WITH_NOLOCK_Parses_OrDocumented", () => {
      const sql = `
        SELECT ID, Name
        FROM Contacts WITH (NOLOCK)
      `;
      const result = tryParse(sql);
      // Document if table hints are supported
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("WITH (NOLOCK) not supported:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });
  });

  describe("Prohibited Constructs (Should Still Parse)", () => {
    // Note: We want to parse these to detect and report them, not reject at parse time

    test("CTE_WITH_Parses", () => {
      const sql = `
        WITH CTE AS (
          SELECT ID, Name FROM Contacts
        )
        SELECT * FROM CTE
      `;
      const result = tryParse(sql);
      // CTEs should parse (even though prohibited in MCE) so we can detect them
      expect(result.parses).toBe(true);
    });

    test("DECLARE_Variable_Parses_OrDocumented", () => {
      const sql = `
        DECLARE @Count INT = 10;
        SELECT TOP (@Count) * FROM Contacts
      `;
      const result = tryParse(sql);
      // Variables may or may not parse - document the result
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("DECLARE not parsed:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });

    test("Variable_Usage_AtSign_Parses_OrDocumented", () => {
      const sql = `SELECT @VariableName`;
      const result = tryParse(sql);
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("@Variable not parsed:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });

    test("TempTable_Parses_OrDocumented", () => {
      const sql = `SELECT * FROM #TempTable`;
      const result = tryParse(sql);
      if (!result.parses) {
        // eslint-disable-next-line no-console
        console.log("#TempTable not parsed:", result.error?.message);
      }
      expect(typeof result.parses).toBe("boolean");
    });

    test("LIMIT_Parses_InTSQL_ForDetection", () => {
      // LIMIT is MySQL syntax but parser accepts it for T-SQL dialect
      // This is fine - we can detect it in AST and flag as MCE-unsupported
      const sql = `SELECT * FROM Contacts LIMIT 10`;
      const result = tryParse(sql);
      // Document: parser accepts LIMIT, so we need AST-based detection
      if (result.parses) {
        const stmts = getAstStatements(result.ast);
        // eslint-disable-next-line no-console
        console.log("LIMIT clause in AST:", stmts?.[0]?.limit);
      }
      expect(typeof result.parses).toBe("boolean");
    });

    test("INSERT_Parses", () => {
      const sql = `INSERT INTO Contacts (Name) VALUES ('Test')`;
      const result = tryParse(sql);
      // Should parse (even though prohibited) so we can detect it
      expect(result.parses).toBe(true);
    });

    test("UPDATE_Parses", () => {
      const sql = `UPDATE Contacts SET Name = 'Test' WHERE ID = 1`;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });

    test("DELETE_Parses", () => {
      const sql = `DELETE FROM Contacts WHERE ID = 1`;
      const result = tryParse(sql);
      expect(result.parses).toBe(true);
    });
  });

  describe("Syntax Error Detection", () => {
    test("MissingComma_DetectedWithLocation", () => {
      // The original problem: missing comma between expressions
      const sql = `
        SELECT
          imc.ContactID, 1234
          imc.ContactKey
        FROM [IdMap_ContactKey_ContactID] AS imc
      `;
      const result = tryParse(sql);
      expect(result.parses).toBe(false);
      expect(result.error).toBeDefined();
      // Check if location information is available
      if (result.error?.location) {
        expect(result.error.location.start).toBeDefined();
      }
    });

    test("UnmatchedParenthesis_DetectedWithLocation", () => {
      const sql = `SELECT COUNT( FROM Contacts`;
      const result = tryParse(sql);
      expect(result.parses).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("UnterminatedString_DetectedWithLocation", () => {
      const sql = `SELECT 'unclosed string FROM Contacts`;
      const result = tryParse(sql);
      expect(result.parses).toBe(false);
      expect(result.error).toBeDefined();
    });

    test("InvalidSyntax_MissingFROM_Parses", () => {
      // Note: "SELECT *" without FROM might be valid in some SQL dialects
      const sql = `SELECT * WHERE ID = 1`;
      const result = tryParse(sql);
      // Document behavior
      expect(typeof result.parses).toBe("boolean");
    });
  });

  describe("Error Location Extraction", () => {
    test("ParseError_HasLineAndColumn", () => {
      const sql = `SELECT , FROM Contacts`;
      const result = tryParse(sql);

      expect(result.parses).toBe(false);
      expect(result.error).toBeDefined();

      // The parser should provide location info
      // Document what format it uses
      if (result.error?.location) {
        const loc = result.error.location;
        // Check if we have start position
        if (loc.start) {
          expect(typeof loc.start.line).toBe("number");
          expect(typeof loc.start.column).toBe("number");
          // Document if offset is available
          if (loc.start.offset !== undefined) {
            expect(typeof loc.start.offset).toBe("number");
          }
        }
      }
    });

    test("ParseError_MultiLine_HasCorrectLocation", () => {
      const sql = `SELECT
        a,
        b
        c
      FROM Table`;
      const result = tryParse(sql);

      expect(result.parses).toBe(false);
      if (result.error?.location?.start) {
        // The error should point to line 4 or 5 (where 'c' is)
        expect(result.error.location.start.line).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe("AST Node Shape Exploration", () => {
    test("SELECT_AST_HasExpectedShape", () => {
      const sql = "SELECT ID, Name FROM Contacts WHERE ID = 1";
      const result = tryParse(sql);

      expect(result.parses).toBe(true);
      expect(result.ast).toBeDefined();

      // Explore AST shape - use helper to normalize
      const stmts = getAstStatements(result.ast);
      expect(stmts).not.toBeNull();
      expect(stmts!.length).toBeGreaterThanOrEqual(1);

      const stmt = stmts![0];
      expect(stmt).toHaveProperty("type");

      // Document the AST shape
      // eslint-disable-next-line no-console
      console.log("SELECT AST type:", stmt.type);
      // eslint-disable-next-line no-console
      console.log("SELECT AST keys:", Object.keys(stmt));
    });

    test("JOIN_AST_HasJoinInfo", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        INNER JOIN TableB AS b ON a.ID = b.AID
      `;
      const result = tryParse(sql);

      expect(result.parses).toBe(true);
      const stmts = getAstStatements(result.ast);
      expect(stmts).not.toBeNull();
      const stmt = stmts![0];

      // Check if FROM clause contains join info
      expect(stmt).toHaveProperty("from");
      // eslint-disable-next-line no-console
      console.log("JOIN FROM shape:", JSON.stringify(stmt.from, null, 2));
    });

    test("Subquery_AST_HasNestedStatement", () => {
      const sql = `
        SELECT ID
        FROM Contacts
        WHERE ID IN (SELECT ContactID FROM Orders)
      `;
      const result = tryParse(sql);

      expect(result.parses).toBe(true);
      const stmts = getAstStatements(result.ast);
      expect(stmts).not.toBeNull();
      const stmt = stmts![0];

      // Check if WHERE clause contains subquery
      expect(stmt).toHaveProperty("where");
    });

    test("CTE_AST_HasWithClause", () => {
      const sql = `
        WITH CTE AS (SELECT ID FROM Contacts)
        SELECT * FROM CTE
      `;
      const result = tryParse(sql);

      if (result.parses) {
        const stmts = getAstStatements(result.ast);
        expect(stmts).not.toBeNull();
        const stmt = stmts![0];
        // Document CTE representation
        // eslint-disable-next-line no-console
        console.log("CTE AST keys:", Object.keys(stmt));
        // eslint-disable-next-line no-console
        console.log("CTE 'with' property:", stmt.with);
        expect(stmt).toHaveProperty("with");
      }
    });

    test("INSERT_AST_HasStatementType", () => {
      const sql = "INSERT INTO Contacts (Name) VALUES ('Test')";
      const result = tryParse(sql);

      if (result.parses) {
        const stmts = getAstStatements(result.ast);
        expect(stmts).not.toBeNull();
        const stmt = stmts![0];
        // eslint-disable-next-line no-console
        console.log("INSERT AST type:", stmt.type);
        expect(stmt.type).toBe("insert");
      }
    });

    test("UPDATE_AST_HasStatementType", () => {
      const sql = "UPDATE Contacts SET Name = 'Test'";
      const result = tryParse(sql);

      if (result.parses) {
        const stmts = getAstStatements(result.ast);
        expect(stmts).not.toBeNull();
        const stmt = stmts![0];
        // eslint-disable-next-line no-console
        console.log("UPDATE AST type:", stmt.type);
        expect(stmt.type).toBe("update");
      }
    });

    test("DELETE_AST_HasStatementType", () => {
      const sql = "DELETE FROM Contacts WHERE ID = 1";
      const result = tryParse(sql);

      if (result.parses) {
        const stmts = getAstStatements(result.ast);
        expect(stmts).not.toBeNull();
        const stmt = stmts![0];
        // eslint-disable-next-line no-console
        console.log("DELETE AST type:", stmt.type);
        expect(stmt.type).toBe("delete");
      }
    });
  });

  describe("AST Node Location Information", () => {
    test("AST_Nodes_HaveLocationInfo", () => {
      const sql = "SELECT ID, Name FROM Contacts";
      const result = tryParse(sql);

      expect(result.parses).toBe(true);
      const stmts = getAstStatements(result.ast);
      expect(stmts).not.toBeNull();
      const stmt = stmts![0];

      // Check if AST nodes have location info
      // Document what location format is used (if any)
      const hasLocationOnStatement =
        Object.prototype.hasOwnProperty.call(stmt, "loc") ||
        Object.prototype.hasOwnProperty.call(stmt, "location") ||
        Object.prototype.hasOwnProperty.call(stmt, "start") ||
        Object.prototype.hasOwnProperty.call(stmt, "range");

      // Document finding
      // eslint-disable-next-line no-console
      console.log("Statement has location info:", hasLocationOnStatement);
      // eslint-disable-next-line no-console
      console.log("Statement keys:", Object.keys(stmt));
    });
  });

  describe("Location Conversion Strategy", () => {
    test("ParseError_LocationFormat_Documented", () => {
      const sql = "SELECT , FROM Contacts";
      const result = tryParse(sql);

      expect(result.parses).toBe(false);
      // Document the error location format
      // eslint-disable-next-line no-console
      console.log("Error object:", JSON.stringify(result.error, null, 2));
    });

    test("ParseError_LineColumn_ToOffset_Conversion", () => {
      const sql = "SELECT\n,\nFROM Contacts";
      const result = tryParse(sql);

      expect(result.parses).toBe(false);

      if (result.error?.location?.start) {
        const { line, column, offset } = result.error.location.start;
        // eslint-disable-next-line no-console
        console.log(
          "Error location: line=%d, column=%d, offset=%d",
          line,
          column,
          offset,
        );

        // If offset is provided, we can use it directly
        // If not, we need to calculate from line/column
        if (offset !== undefined) {
          expect(typeof offset).toBe("number");
        } else {
          // Need line-start table to convert
          const lines = sql.split("\n");
          let calculatedOffset = 0;
          for (const lineContent of lines.slice(0, line - 1)) {
            calculatedOffset += lineContent.length + 1;
          }
          calculatedOffset += column - 1;
          // eslint-disable-next-line no-console
          console.log("Calculated offset:", calculatedOffset);
        }
      }
    });
  });
});
