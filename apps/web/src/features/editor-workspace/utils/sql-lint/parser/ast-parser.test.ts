/**
 * Tests for AST Parser
 *
 * These tests verify the AST-based linting for MCE SQL.
 */

import { describe, expect, test } from "vitest";

import { assertDefined } from "@/test-utils";

import { canParse, getAst, parseAndLint } from "./ast-parser";

describe("AST Parser", () => {
  describe("canParse", () => {
    test("empty_string_returns_true", () => {
      expect(canParse("")).toBe(true);
    });

    test("whitespace_only_returns_true", () => {
      expect(canParse("   \n\t  ")).toBe(true);
    });

    test("valid_select_returns_true", () => {
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
      expect(parseAndLint("")).toHaveLength(0);
    });

    test("whitespace_only_returns_no_diagnostics", () => {
      expect(parseAndLint("   \n\t  ")).toHaveLength(0);
    });
  });

  describe("parseAndLint - Syntax Errors", () => {
    test("unexpected_comma_returns_error", () => {
      const sql = "SELECT , Name FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThan(0);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
    });

    test("syntax_error_has_location_info", () => {
      const sql = "SELECT , FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.startIndex).toBeGreaterThanOrEqual(0);
      expect(diagnostic.endIndex).toBeGreaterThan(diagnostic.startIndex);
    });

    test("unmatched_parenthesis_returns_error", () => {
      const sql = "SELECT COUNT( FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThan(0);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
    });

    test("unterminated_string_returns_error", () => {
      const sql = "SELECT 'unclosed FROM Contacts";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThan(0);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
    });
  });

  describe("parseAndLint - Policy: Prohibited Statements", () => {
    test("insert_statement_returns_error", () => {
      const sql = "INSERT INTO Contacts (Name) VALUES ('Test')";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("INSERT");
      expect(diagnostic.message).toContain("not allowed");
    });

    test("update_statement_returns_error", () => {
      const sql = "UPDATE Contacts SET Name = 'Test'";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("UPDATE");
    });

    test("delete_statement_returns_error", () => {
      const sql = "DELETE FROM Contacts WHERE ID = 1";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("DELETE");
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
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("Common Table Expression");
    });

    test("multiple_ctes_returns_error", () => {
      const sql = `
        WITH CTE1 AS (SELECT ID FROM A),
             CTE2 AS (SELECT ID FROM B)
        SELECT * FROM CTE1 JOIN CTE2 ON CTE1.ID = CTE2.ID
      `;
      const diagnostics = parseAndLint(sql);
      expect(diagnostics.length).toBeGreaterThanOrEqual(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("Common Table Expression");
    });
  });

  describe("parseAndLint - Policy: LIMIT Clause", () => {
    test("limit_clause_returns_error", () => {
      const sql = "SELECT * FROM Contacts LIMIT 10";
      const diagnostics = parseAndLint(sql);
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("LIMIT");
      expect(diagnostic.message).toContain("TOP");
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
      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.message).not.toContain("Expected");
      expect(diagnostic.message.length).toBeLessThan(200);
    });

    test("unexpected_comma_has_helpful_message", () => {
      const sql = "SELECT , FROM Contacts";
      const diagnostics = parseAndLint(sql);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.message).toContain("comma");
    });
  });

  describe("parseAndLint - Unbracketed DE Name Recovery", () => {
    test("multi_word_de_name_returns_bracket_guidance", () => {
      const sql = "SELECT * FROM My Data Extension";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("brackets");
      expect(diagnostic.message).toContain("[My Data Extension]");
    });

    test("four_word_de_name_returns_bracket_guidance", () => {
      const sql = "SELECT * FROM My Very Long Name";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("brackets");
    });

    test("ent_prefix_multi_word_returns_bracket_guidance", () => {
      const sql = "SELECT * FROM ENT.My Data Extension";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).toContain("ENT.[My Data Extension]");
    });

    test("regular_syntax_error_still_returns_generic_message", () => {
      const sql = "SELECT , FROM Contacts";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(1);
      const diagnostic = diagnostics[0];
      assertDefined(diagnostic);
      expect(diagnostic.severity).toBe("error");
      expect(diagnostic.message).not.toContain("brackets");
    });

    test("two_word_table_alias_does_not_trigger_recovery", () => {
      const sql = "SELECT * FROM Contacts c WHERE c.ID > 0";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(0);
    });

    test("bracketed_name_parses_successfully", () => {
      const sql = "SELECT * FROM [My Data Extension]";
      const diagnostics = parseAndLint(sql);

      expect(diagnostics).toHaveLength(0);
    });
  });
});
