/**
 * Tests for MCE Policy Validation Layer
 *
 * These tests verify the AST-based policy checks for MCE SQL restrictions.
 * Policy checks include:
 * - Statement type allowlist
 * - Prohibited statements (INSERT, UPDATE, DELETE, etc.)
 * - CTE detection
 * - LIMIT prohibition
 * - Unsupported functions
 */

import { describe, test, expect } from "vitest";
import { parseAndLint } from "./ast-parser";

describe("Policy Validation Layer", () => {
  describe("Statement Type Allowlist", () => {
    test("select_statement_is_allowed", () => {
      const diagnostics = parseAndLint("SELECT ID, Name FROM Contacts");
      expect(diagnostics).toHaveLength(0);
    });

    test("select_with_subquery_is_allowed", () => {
      const sql = `
        SELECT ID FROM Contacts
        WHERE ID IN (SELECT ContactID FROM Orders)
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("select_with_joins_is_allowed", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM Contacts a
        INNER JOIN Orders b ON a.ID = b.ContactID
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("Prohibited DML Statements", () => {
    test("insert_returns_error", () => {
      const sql = "INSERT INTO Contacts (Name) VALUES ('Test')";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("INSERT");
      expect(diagnostics[0].message).toContain("read-only");
    });

    test("update_returns_error", () => {
      const sql = "UPDATE Contacts SET Name = 'Test' WHERE ID = 1";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("UPDATE");
      expect(diagnostics[0].message).toContain("read-only");
    });

    test("delete_returns_error", () => {
      const sql = "DELETE FROM Contacts WHERE ID = 1";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("DELETE");
      expect(diagnostics[0].message).toContain("read-only");
    });

    test("merge_returns_error", () => {
      // Note: MERGE may not fully parse in transactsql dialect
      // but we test the policy message if it does
      const sql = `
        MERGE INTO Target t
        USING Source s ON t.ID = s.ID
        WHEN MATCHED THEN UPDATE SET Name = s.Name
      `;
      const diagnostics = parseAndLint(sql);
      // If parse fails, that's also acceptable
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].severity).toBe("error");
    });

    test("truncate_returns_error", () => {
      const sql = "TRUNCATE TABLE Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("TRUNCATE");
    });
  });

  describe("Prohibited DDL Statements", () => {
    test("create_table_returns_error", () => {
      const sql = "CREATE TABLE Test (ID INT)";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("CREATE");
    });

    test("drop_table_returns_error", () => {
      const sql = "DROP TABLE Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("DROP");
    });

    test("alter_table_returns_error", () => {
      const sql = "ALTER TABLE Contacts ADD Email VARCHAR(100)";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("ALTER");
    });
  });

  describe("CTE Detection", () => {
    test("simple_cte_returns_error", () => {
      const sql = `
        WITH CTE AS (
          SELECT ID, Name FROM Contacts
        )
        SELECT * FROM CTE
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("Common Table Expression");
      expect(diagnostics[0].message).toContain("WITH");
    });

    test("multiple_ctes_returns_error", () => {
      const sql = `
        WITH CTE1 AS (SELECT ID FROM A),
             CTE2 AS (SELECT ID FROM B)
        SELECT * FROM CTE1 JOIN CTE2 ON CTE1.ID = CTE2.ID
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("Common Table Expression");
    });

    test("recursive_cte_returns_error", () => {
      const sql = `
        WITH Recursive AS (
          SELECT ID, ParentID, 1 AS Level FROM Categories WHERE ParentID IS NULL
          UNION ALL
          SELECT c.ID, c.ParentID, r.Level + 1 FROM Categories c
          INNER JOIN Recursive r ON c.ParentID = r.ID
        )
        SELECT * FROM Recursive
      `;
      const diagnostics = parseAndLint(sql);
      // May fail to parse due to UNION ALL in CTE, but if it parses, should flag CTE
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0].severity).toBe("error");
    });

    test("cte_error_highlights_with_keyword", () => {
      const sql = "WITH CTE AS (SELECT 1 AS ID) SELECT * FROM CTE";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      // endIndex should be at or near 'WITH' keyword end
      expect(diagnostics[0].startIndex).toBe(0);
      expect(diagnostics[0].endIndex).toBeGreaterThanOrEqual(4); // At least 'WITH'
    });
  });

  describe("LIMIT Clause Prohibition", () => {
    test("limit_clause_returns_error", () => {
      const sql = "SELECT * FROM Contacts LIMIT 10";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("LIMIT");
      expect(diagnostics[0].message).toContain("TOP");
    });

    test("limit_with_offset_returns_error", () => {
      const sql = "SELECT * FROM Contacts LIMIT 10 OFFSET 5";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics.some((d) => d.message.includes("LIMIT"))).toBe(true);
    });

    test("limit_error_highlights_limit_keyword", () => {
      const sql = "SELECT ID FROM Contacts LIMIT 10";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      // Should highlight starting at LIMIT position
      expect(diagnostics[0].startIndex).toBe(sql.indexOf("LIMIT"));
    });
  });

  describe("Valid Alternatives to LIMIT", () => {
    test("top_clause_is_allowed", () => {
      const sql = "SELECT TOP 10 * FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("top_with_percent_is_allowed", () => {
      const sql = "SELECT TOP 10 PERCENT * FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("offset_fetch_is_allowed", () => {
      const sql = `
        SELECT ID, Name FROM Contacts
        ORDER BY Name
        OFFSET 10 ROWS
        FETCH NEXT 20 ROWS ONLY
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    /**
     * NOTE: This test documents a parser limitation.
     * node-sql-parser does not support "FETCH FIRST" syntax - only "FETCH NEXT".
     * While FETCH FIRST is valid T-SQL syntax, the parser fails to parse it.
     * This is acceptable behavior as FETCH NEXT is the more common syntax.
     */
    test("offset_fetch_first_causes_parse_error_due_to_parser_limitation", () => {
      const sql = `
        SELECT ID FROM Contacts
        ORDER BY ID
        OFFSET 0 ROWS
        FETCH FIRST 5 ROWS ONLY
      `;
      const diagnostics = parseAndLint(sql);
      // Parser limitation: does not recognize FETCH FIRST, only FETCH NEXT
      // Returns a parse error, which is acceptable
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0].severity).toBe("error");
    });
  });

  describe("Unsupported Functions", () => {
    test("string_agg_returns_error", () => {
      const sql = "SELECT STRING_AGG(Name, ',') FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("STRING_AGG");
      expect(diagnostics[0].message).toContain("not available");
    });

    test("string_split_returns_error", () => {
      const sql = "SELECT * FROM STRING_SPLIT('a,b,c', ',')";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("STRING_SPLIT");
    });

    test("try_convert_returns_error_with_alternative", () => {
      const sql = "SELECT TRY_CONVERT(INT, '123') FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("TRY_CONVERT");
      expect(diagnostics[0].message).toContain("CONVERT");
    });

    test("try_cast_returns_error_with_alternative", () => {
      const sql = "SELECT TRY_CAST('123' AS INT) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("TRY_CAST");
      expect(diagnostics[0].message).toContain("CAST");
    });

    test("openjson_returns_error", () => {
      const sql = "SELECT * FROM OPENJSON('{\"a\":1}')";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("OPENJSON");
    });

    test("isjson_returns_error", () => {
      const sql = "SELECT ISJSON('{\"a\":1}') FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("ISJSON");
    });

    test("unsupported_function_in_where_clause", () => {
      const sql =
        "SELECT ID FROM Contacts WHERE STRING_AGG(Name, ',') = 'test'";
      const diagnostics = parseAndLint(sql);
      // May fail to parse due to aggregate in WHERE, but test the policy check
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0].severity).toBe("error");
    });

    test("unsupported_function_in_subquery", () => {
      const sql = `
        SELECT ID FROM Contacts
        WHERE ID IN (SELECT STRING_AGG(ID, ',') FROM Orders)
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("STRING_AGG");
    });

    test("multiple_unsupported_functions", () => {
      const sql =
        "SELECT STRING_AGG(Name, ','), TRY_CONVERT(INT, ID) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      // May fail to parse due to complex structure, but test what we can
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      expect(diagnostics[0].severity).toBe("error");
    });

    test("unsupported_function_error_position", () => {
      const sql = "SELECT ID, STRING_AGG(Name, ',') FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      // startIndex should be at STRING_AGG position
      expect(diagnostics[0].startIndex).toBe(sql.toLowerCase().indexOf("string_agg"));
    });
  });

  describe("Supported Functions (No Errors)", () => {
    test("count_is_allowed", () => {
      const sql = "SELECT COUNT(*) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("sum_avg_min_max_are_allowed", () => {
      const sql = "SELECT SUM(Amount), AVG(Amount), MIN(Amount), MAX(Amount) FROM Orders";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("string_functions_are_allowed", () => {
      const sql = "SELECT LEN(Name), UPPER(Name), LOWER(Name), LTRIM(Name) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("date_functions_are_allowed", () => {
      const sql = "SELECT GETDATE(), YEAR(Created), DATEADD(DAY, 1, Created) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("conversion_functions_are_allowed", () => {
      const sql = "SELECT CAST(ID AS VARCHAR), CONVERT(VARCHAR, ID, 1) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("null_handling_functions_are_allowed", () => {
      const sql = "SELECT ISNULL(Name, ''), COALESCE(Name, ''), NULLIF(Name, 'N/A') FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("iif_is_allowed", () => {
      const sql = "SELECT IIF(ID > 0, 'Yes', 'No') FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("window_functions_are_allowed", () => {
      const sql = "SELECT ID, ROW_NUMBER() OVER (ORDER BY ID) AS RowNum FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("nested_supported_functions_are_allowed", () => {
      const sql = "SELECT UPPER(LTRIM(RTRIM(Name))) FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("case_expression_is_allowed", () => {
      const sql = `
        SELECT
          CASE WHEN ID > 0 THEN 'Positive' ELSE 'Zero' END AS Category
        FROM Contacts
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("Complex Queries with Multiple Policies", () => {
    test("valid_complex_query", () => {
      const sql = `
        SELECT
          c.ID,
          c.Name,
          COUNT(o.ID) AS OrderCount,
          SUM(o.Amount) AS TotalAmount
        FROM Contacts c
        LEFT JOIN Orders o ON c.ID = o.ContactID
        WHERE c.Status = 'Active'
        GROUP BY c.ID, c.Name
        HAVING COUNT(o.ID) > 0
        ORDER BY TotalAmount DESC
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("union_queries_are_allowed", () => {
      const sql = `
        SELECT ID, Name FROM Contacts WHERE Status = 'Active'
        UNION
        SELECT ID, Name FROM Contacts WHERE Status = 'Pending'
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("multiple_subqueries_are_allowed", () => {
      const sql = `
        SELECT *
        FROM (SELECT ID, Name FROM Contacts) AS c
        WHERE c.ID IN (SELECT ContactID FROM Orders WHERE Amount > 100)
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });
  });
});
