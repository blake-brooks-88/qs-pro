import { describe, expect, it } from "vitest";

import { formatSql, SQL_TAB_SIZE } from "./format-sql";

describe("formatSql", () => {
  describe("keyword uppercasing", () => {
    it("uppercases SELECT and FROM", () => {
      const result = formatSql("select * from [DE]");
      expect(result).toContain("SELECT");
      expect(result).toContain("FROM");
    });

    it("uppercases compound keywords INNER JOIN, LEFT JOIN, GROUP BY, ORDER BY", () => {
      const result = formatSql(
        "select a from [DE] inner join [Other] on a = b left join [Third] on c = d group by a order by a",
      );
      expect(result).toContain("INNER JOIN");
      expect(result).toContain("LEFT JOIN");
      expect(result).toContain("GROUP BY");
      expect(result).toContain("ORDER BY");
    });

    it("uppercases WHERE and AND", () => {
      const result = formatSql("select a from [DE] where x = 1 and y = 2");
      expect(result).toContain("WHERE");
      expect(result).toContain("AND");
    });
  });

  describe("identifier preservation", () => {
    it("preserves bracket identifier contents exactly", () => {
      const result = formatSql("select * from [My Data Extension]");
      expect(result).toContain("[My Data Extension]");
    });

    it("preserves Ent. prefix as-is", () => {
      const result = formatSql("select * from Ent.[SharedDE]");
      expect(result).toContain("Ent.[SharedDE]");
    });

    it("preserves system data views with underscore prefix", () => {
      const resultJob = formatSql("select * from _Job");
      expect(resultJob).toContain("_Job");

      const resultSubs = formatSql("select * from _Subscribers");
      expect(resultSubs).toContain("_Subscribers");
    });

    it("preserves column names and aliases as written", () => {
      const result = formatSql(
        "select EmailAddress as Email, SubscriberKey from [Contacts]",
      );
      expect(result).toContain("EmailAddress");
      expect(result).toContain("Email");
      expect(result).toContain("SubscriberKey");
    });
  });

  describe("MCE function handling", () => {
    it("preserves function name casing with functionCase: preserve", () => {
      const result = formatSql("select dateadd(day, -7, getdate()) from _Job");
      expect(result).toContain("dateadd");
      expect(result).toContain("getdate");
    });

    it("uppercases data type names", () => {
      const result = formatSql("select convert(varchar, x) from [DE]");
      expect(result).toContain("VARCHAR");
    });
  });

  describe("indentation", () => {
    it("exports SQL_TAB_SIZE as 4", () => {
      expect(SQL_TAB_SIZE).toBe(4);
    });

    it("uses 4-space indentation and no tabs", () => {
      const result = formatSql("select a, b from [DE] where x = 1");
      expect(result).toContain("    ");
      expect(result).not.toContain("\t");
    });
  });

  describe("idempotency", () => {
    it("produces identical output when formatting already-formatted SQL", () => {
      const original = "select a, b from [DE] where x = 1";
      const formatted = formatSql(original);
      const reformatted = formatSql(formatted);
      expect(reformatted).toBe(formatted);
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(formatSql("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      const result = formatSql("   \n\t  ");
      expect(result.trim()).toBe("");
    });

    it("properly indents CASE/WHEN expressions with uppercased keywords", () => {
      const result = formatSql(
        "select case when x = 1 then 'A' else 'B' end from [DE]",
      );
      expect(result).toContain("CASE");
      expect(result).toContain("WHEN");
      expect(result).toContain("THEN");
      expect(result).toContain("ELSE");
      expect(result).toContain("END");
    });

    it("properly nests subquery with JOIN indentation", () => {
      const result = formatSql(
        "select a from [DE] inner join (select b from [Other] group by b) sub on a = sub.b",
      );
      expect(result).toContain("INNER JOIN");
      expect(result).toContain("GROUP BY");
      expect(result).toContain("SELECT");
    });

    it("preserves single-line comments", () => {
      const result = formatSql("-- comment\nselect a from [DE]");
      expect(result).toContain("-- comment");
    });

    it("preserves block comments", () => {
      const result = formatSql("select a /* inline */ from [DE]");
      expect(result).toContain("/* inline */");
    });

    it("formats a complex MCE query with preserved identifiers", () => {
      const result = formatSql(
        "SELECT s.EmailAddress, j.JobID FROM [_Subscribers] s INNER JOIN [_Job] j ON s.SubscriberID = j.SubscriberID WHERE j.DeliveredTime > DATEADD(day, -30, GETDATE())",
      );

      expect(result).toContain("SELECT");
      expect(result).toContain("FROM");
      expect(result).toContain("INNER JOIN");
      expect(result).toContain("WHERE");
      expect(result).toContain("[_Subscribers]");
      expect(result).toContain("[_Job]");
      expect(result).toContain("EmailAddress");
      expect(result).toContain("DATEADD");
      expect(result).toContain("GETDATE");
    });
  });
});
