import { describe, it, expect } from "vitest";
import { aliasInClauseRule } from "./alias-in-clause";
import type { LintContext } from "../types";

const createContext = (sql: string): LintContext => ({
  sql,
  tokens: [],
  dataExtensions: [],
});

describe("aliasInClauseRule", () => {
  describe("detects alias in WHERE clause", () => {
    it("should detect alias used in WHERE", () => {
      const sql = "SELECT SUM(amount) AS total FROM [Orders] WHERE total > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "total"');
      expect(diagnostics[0].message).toContain("WHERE");
      expect(diagnostics[0].severity).toBe("error");
    });

    it("should detect multiple aliases in WHERE", () => {
      const sql =
        "SELECT amount AS amt, quantity AS qty FROM [Orders] WHERE amt > 100 AND qty < 10";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(2);
      expect(diagnostics[0].message).toContain('Column alias "amt"');
      expect(diagnostics[1].message).toContain('Column alias "qty"');
    });
  });

  describe("detects alias in ORDER BY clause", () => {
    it("should detect alias used in ORDER BY", () => {
      const sql = "SELECT name AS n FROM [Contacts] ORDER BY n";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "n"');
      expect(diagnostics[0].message).toContain("ORDER BY");
    });

    it("should detect alias in ORDER BY with ASC/DESC", () => {
      const sql =
        "SELECT created_date AS created FROM [Events] ORDER BY created DESC";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "created"');
    });
  });

  describe("detects alias in GROUP BY clause", () => {
    it("should detect alias used in GROUP BY", () => {
      const sql =
        "SELECT category AS cat, COUNT(*) FROM [Products] GROUP BY cat";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "cat"');
      expect(diagnostics[0].message).toContain("GROUP BY");
    });
  });

  describe("detects alias in HAVING clause", () => {
    it("should detect alias used in HAVING", () => {
      const sql =
        "SELECT type, COUNT(*) AS cnt FROM [Items] GROUP BY type HAVING cnt > 5";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "cnt"');
      expect(diagnostics[0].message).toContain("HAVING");
    });
  });

  describe("handles table aliases correctly", () => {
    it("should NOT flag table aliases", () => {
      const sql = "SELECT o.amount FROM [Orders] o WHERE o.amount > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should NOT flag table aliases with AS keyword", () => {
      const sql = "SELECT o.amount FROM [Orders] AS o WHERE o.amount > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should distinguish table aliases from column aliases", () => {
      const sql =
        "SELECT o.amount AS amt FROM [Orders] o WHERE o.status = 'active' AND amt > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "amt"');
    });
  });

  describe("handles no alias cases", () => {
    it("should NOT flag column names that are not aliases", () => {
      const sql = "SELECT amount AS total FROM [Orders] WHERE amount > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should handle queries without aliases", () => {
      const sql =
        "SELECT amount, status FROM [Orders] WHERE amount > 100 ORDER BY status";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("handles bracketed aliases", () => {
    it("should detect bracketed alias in ORDER BY", () => {
      const sql =
        "SELECT name AS [Full Name] FROM [Contacts] ORDER BY [Full Name]";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "[Full Name]"');
      expect(diagnostics[0].message).toContain("ORDER BY");
    });

    it("should detect bracketed alias in WHERE", () => {
      const sql =
        "SELECT price AS [Unit Price] FROM [Products] WHERE [Unit Price] > 50";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "[Unit Price]"');
    });
  });

  describe("handles aliases without AS keyword", () => {
    it("should detect implicit alias after function call", () => {
      const sql = "SELECT SUM(amount) total FROM [Orders] WHERE total > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "total"');
    });

    it("should detect implicit alias after CONCAT", () => {
      const sql =
        "SELECT CONCAT(first_name, ' ', last_name) full_name FROM [Contacts] ORDER BY full_name";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "full_name"');
    });
  });

  describe("handles complex queries", () => {
    it("should handle JOINs with table and column aliases", () => {
      const sql = `
        SELECT o.id, c.name AS customer_name
        FROM [Orders] o
        JOIN [Customers] c ON o.customer_id = c.id
        WHERE customer_name = 'John'
      `;
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "customer_name"');
    });

    it("should handle subqueries", () => {
      const sql = `
        SELECT order_total AS total
        FROM (SELECT SUM(amount) AS order_total FROM [Orders]) sub
        WHERE total > 1000
      `;
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      // The outer alias "total" is used in WHERE
      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain("total");
    });
  });

  describe("handles case insensitivity", () => {
    it("should detect alias regardless of case", () => {
      const sql = "SELECT amount AS Total FROM [Orders] WHERE TOTAL > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics[0].message).toContain('Column alias "Total"');
    });
  });

  describe("handles comments and strings", () => {
    it("should not flag aliases in comments", () => {
      const sql = `
        SELECT amount AS total FROM [Orders]
        -- WHERE total > 100
        WHERE amount > 100
      `;
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });

    it("should not flag aliases in string literals", () => {
      const sql =
        "SELECT name AS alias FROM [Table] WHERE description = 'alias is used'";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics).toHaveLength(0);
    });
  });

  describe("error message format", () => {
    it("should include MCE in error message", () => {
      const sql = "SELECT amount AS total FROM [Orders] WHERE total > 100";
      const diagnostics = aliasInClauseRule.check(createContext(sql));

      expect(diagnostics[0].message).toContain("MCE");
      expect(diagnostics[0].message).toContain("original expression");
    });
  });
});
