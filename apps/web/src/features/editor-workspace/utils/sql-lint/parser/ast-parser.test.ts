/**
 * Tests for AST Parser
 *
 * These tests verify the AST-based linting for MCE SQL.
 */

import { describe, test, expect } from "vitest";
import { parseAndLint, canParse, getAst } from "./ast-parser";

describe("AST Parser", () => {
  describe("canParse", () => {
    test("empty_string_returns_true", () => {
      expect(canParse("")).toBe(true);
    });

    test("whitespace_only_returns_true", () => {
      expect(canParse("   \n\t  ")).toBe(true);
    });

    test("valid_select_returns_true", () => {
      // Note: "Table" is reserved, use bracketed or different name
      expect(canParse("SELECT * FROM [Table]")).toBe(true);
      expect(canParse("SELECT * FROM Contacts")).toBe(true);
    });

    test("invalid_syntax_returns_false", () => {
      expect(canParse("SELECT , FROM Contacts")).toBe(false);
    });
  });

  describe("getAst", () => {
    test("returns_ast_for_valid_sql", () => {
      const ast = getAst("SELECT ID FROM Contacts");
      expect(ast).not.toBeNull();
      expect(ast).toHaveProperty("type", "select");
    });

    test("returns_null_for_invalid_sql", () => {
      const ast = getAst("SELECT , FROM");
      expect(ast).toBeNull();
    });
  });

  describe("parseAndLint - Valid SQL", () => {
    test("valid_select_returns_no_diagnostics", () => {
      const diagnostics = parseAndLint("SELECT ID, Name FROM Contacts");
      expect(diagnostics).toHaveLength(0);
    });

    test("valid_select_with_joins_returns_no_diagnostics", () => {
      const sql = `
        SELECT a.ID, b.Name
        FROM TableA AS a
        INNER JOIN TableB AS b ON a.ID = b.AID
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("valid_subquery_returns_no_diagnostics", () => {
      const sql = `
        SELECT ID
        FROM Contacts
        WHERE ID IN (SELECT ContactID FROM Orders)
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("valid_group_by_returns_no_diagnostics", () => {
      const sql = `
        SELECT CustomerKey, COUNT(*) AS Total
        FROM Orders
        GROUP BY CustomerKey
        HAVING COUNT(*) > 5
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("parseAndLint - Empty SQL", () => {
    test("empty_string_returns_no_diagnostics", () => {
      // Empty SQL is handled by prereq rules, not parser
      expect(parseAndLint("")).toHaveLength(0);
    });

    test("whitespace_only_returns_no_diagnostics", () => {
      expect(parseAndLint("   \n\t  ")).toHaveLength(0);
    });
  });

  describe("parseAndLint - Syntax Errors", () => {
    test("unexpected_comma_returns_error", () => {
      // Leading comma in SELECT is definitely an error
      const sql = "SELECT , Name FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].severity).toBe("error");
    });

    test("syntax_error_has_location_info", () => {
      const sql = "SELECT , FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].startIndex).toBeGreaterThanOrEqual(0);
      expect(diagnostics[0].endIndex).toBeGreaterThan(diagnostics[0].startIndex);
    });

    test("unmatched_parenthesis_returns_error", () => {
      const sql = "SELECT COUNT( FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].severity).toBe("error");
    });

    test("unterminated_string_returns_error", () => {
      const sql = "SELECT 'unclosed FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].severity).toBe("error");
    });

    // Note: "SELECT * WHERE" without FROM actually parses successfully
    // in node-sql-parser (sets from: null). This is handled by existing
    // token-based prereq rules that check for FROM clause.
  });

  describe("parseAndLint - Policy: Prohibited Statements", () => {
    test("insert_statement_returns_error", () => {
      const sql = "INSERT INTO Contacts (Name) VALUES ('Test')";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("INSERT");
      expect(diagnostics[0].message).toContain("not allowed");
    });

    test("update_statement_returns_error", () => {
      const sql = "UPDATE Contacts SET Name = 'Test'";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("UPDATE");
    });

    test("delete_statement_returns_error", () => {
      const sql = "DELETE FROM Contacts WHERE ID = 1";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("DELETE");
    });
  });

  describe("parseAndLint - Policy: CTE Detection", () => {
    test("cte_returns_error", () => {
      const sql = `
        WITH CTE AS (
          SELECT ID, Name FROM Contacts
        )
        SELECT * FROM CTE
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("Common Table Expression");
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
  });

  describe("parseAndLint - Policy: LIMIT Clause", () => {
    test("limit_clause_returns_error", () => {
      const sql = "SELECT * FROM Contacts LIMIT 10";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
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
  });

  describe("parseAndLint - Valid Alternatives", () => {
    test("top_clause_is_allowed", () => {
      const sql = "SELECT TOP 10 * FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("offset_fetch_is_allowed", () => {
      // T-SQL OFFSET/FETCH is valid and should not be flagged
      const sql = `
        SELECT ID, Name FROM Contacts
        ORDER BY Name
        OFFSET 10 ROWS
        FETCH NEXT 20 ROWS ONLY
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });

    test("union_is_allowed", () => {
      const sql = `
        SELECT ID FROM TableA
        UNION
        SELECT ID FROM TableB
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("parseAndLint - Error Message Quality", () => {
    test("error_message_is_user_friendly", () => {
      const sql = "SELECT ,";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBe(1);
      // Should not contain verbose parser internal messages
      expect(diagnostics[0].message).not.toContain("Expected");
      expect(diagnostics[0].message.length).toBeLessThan(200);
    });

    test("unexpected_comma_has_helpful_message", () => {
      const sql = "SELECT , FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics[0].message).toContain("comma");
    });
  });

  describe("parseAndLint - Unbracketed DE Name Recovery", () => {
    test("multi_word_de_name_returns_bracket_guidance", () => {
      const sql = "SELECT * FROM My Data Extension";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("brackets");
      expect(diagnostics[0].message).toContain("[My Data Extension]");
    });

    test("four_word_de_name_returns_bracket_guidance", () => {
      // Multi-word names consistently cause parse errors that we can recover from
      const sql = "SELECT * FROM My Very Long Name";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("brackets");
    });

    test("ent_prefix_multi_word_returns_bracket_guidance", () => {
      const sql = "SELECT * FROM ENT.My Data Extension";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      expect(diagnostics[0].message).toContain("ENT.[My Data Extension]");
    });

    test("regular_syntax_error_still_returns_generic_message", () => {
      // This should NOT trigger bracket recovery - it's just a syntax error
      const sql = "SELECT , FROM Contacts";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].severity).toBe("error");
      // Should be generic parse error, not bracket guidance
      expect(diagnostics[0].message).not.toContain("brackets");
    });

    test("two_word_table_alias_does_not_trigger_recovery", () => {
      // "Contacts c" looks like table + alias, not multi-word DE name
      // The parser should handle this without bracket recovery
      const sql = "SELECT * FROM Contacts c WHERE c.ID > 0";
      const diagnostics = parseAndLint(sql);

      // Should parse successfully (no errors) - Contacts c is valid
      expect(diagnostics).toHaveLength(0);
    });

    test("bracketed_name_parses_successfully", () => {
      const sql = "SELECT * FROM [My Data Extension]";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(0);
    });
  });
});
