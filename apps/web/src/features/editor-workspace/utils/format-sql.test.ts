import { describe, expect, it } from "vitest";

import {
  fixOffsetFetchCase,
  fixSelectTop,
  formatSql,
  moveCommasToLeading,
  SQL_TAB_SIZE,
  stripTrailingSemicolon,
} from "./format-sql";

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
    it("uppercases function names", () => {
      const result = formatSql("select dateadd(day, -7, getdate()) from _Job");
      expect(result).toContain("DATEADD");
      expect(result).toContain("GETDATE");
    });

    it("uppercases data type names", () => {
      const result = formatSql("select convert(varchar, x) from [DE]");
      expect(result).toContain("VARCHAR");
    });

    it("uppercases aggregate functions", () => {
      const result = formatSql(
        "select count(*), sum(x), avg(y), min(z), max(w) from [DE]",
      );
      expect(result).toContain("COUNT(*)");
      expect(result).toContain("SUM(x)");
      expect(result).toContain("AVG(y)");
      expect(result).toContain("MIN(z)");
      expect(result).toContain("MAX(w)");
    });

    it("uppercases date functions", () => {
      const result = formatSql(
        "select getutcdate(), datename(month, x), datepart(weekday, y) from [DE]",
      );
      expect(result).toContain("GETUTCDATE()");
      expect(result).toContain("DATENAME(");
      expect(result).toContain("DATEPART(");
    });

    it("uppercases string functions", () => {
      const result = formatSql(
        "select concat(a, b), upper(c), left(d, 5), trim(e) from [DE]",
      );
      expect(result).toContain("CONCAT(");
      expect(result).toContain("UPPER(");
      expect(result).toContain("LEFT(");
      expect(result).toContain("TRIM(");
    });

    it("uppercases null-handling functions", () => {
      const result = formatSql(
        "select coalesce(a, b), isnull(c, d), nullif(e, f) from [DE]",
      );
      expect(result).toContain("COALESCE(");
      expect(result).toContain("ISNULL(");
      expect(result).toContain("NULLIF(");
    });

    it("uppercases NEWID", () => {
      const result = formatSql("select newid() from [DE]");
      expect(result).toContain("NEWID()");
    });

    it("uppercases IIF", () => {
      const result = formatSql("select iif(x = 1, 'yes', 'no') from [DE]");
      expect(result).toContain("IIF(");
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

  describe("TOP clause formatting", () => {
    it("places TOP 10 on the SELECT line", () => {
      const result = formatSql("select top 10 a from [DE]");
      expect(result).toContain("SELECT TOP 10\n");
    });

    it("places TOP (10) on the SELECT line", () => {
      const result = formatSql("select top (10) a from [DE]");
      expect(result).toContain("SELECT TOP (10)\n");
    });

    it("places TOP 50 PERCENT on the SELECT line", () => {
      const result = formatSql("select top 50 percent a from [DE]");
      expect(result).toContain("SELECT TOP 50 PERCENT\n");
    });

    it("places TOP (50) PERCENT on the SELECT line", () => {
      const result = formatSql("select top (50) percent a from [DE]");
      expect(result).toContain("SELECT TOP (50) PERCENT\n");
    });

    it("places DISTINCT TOP 5 on the SELECT line", () => {
      const result = formatSql("select distinct top 5 a from [DE]");
      expect(result).toContain("SELECT DISTINCT TOP 5\n");
    });

    it("places ALL TOP 5 on the SELECT line", () => {
      const result = formatSql("select all top 5 a from [DE]");
      expect(result).toContain("SELECT ALL TOP 5\n");
    });

    it("keeps columns indented below SELECT TOP", () => {
      const result = formatSql("select top 10 a, b, c from [DE]");
      expect(result).toContain("SELECT TOP 10\n");
      const lines = result.split("\n");
      const columnLines = lines.filter(
        (l) => l.trim() === "a" || l.trim() === ", b" || l.trim() === ", c",
      );
      expect(columnLines.length).toBeGreaterThanOrEqual(1);
      for (const line of columnLines) {
        expect(line).toMatch(/^\s{4}/);
      }
    });

    it("fixes TOP in subqueries", () => {
      const result = formatSql(
        "select a from [DE] inner join (select top 5 b from [Other]) s on a = s.b",
      );
      expect(result).toMatch(/SELECT TOP 5\n/);
    });

    it("produces idempotent output for TOP queries", () => {
      const sql = "select top 10 a, b from [DE] where x = 1";
      const first = formatSql(sql);
      const second = formatSql(first);
      expect(second).toBe(first);
    });

    it("does not modify TOP inside string literals", () => {
      const result = formatSql("select 'TOP 10' as x from [DE]");
      expect(result).toContain("'TOP 10'");
    });

    it("does not modify TOP inside block comments", () => {
      const result = formatSql("select a /* TOP 10 */ from [DE]");
      expect(result).toContain("/* TOP 10 */");
    });

    it("does not alter queries without TOP", () => {
      const withoutTop = "select a from [DE]";
      const result = formatSql(withoutTop);
      expect(result).toContain("SELECT");
      expect(result).toContain("FROM");
      expect(result).not.toContain("TOP");
    });
  });

  describe("fixSelectTop (unit)", () => {
    it("lifts TOP N from indented line onto SELECT line", () => {
      const input = "SELECT\n    TOP 10\n    a\nFROM\n    [DE]";
      const result = fixSelectTop(input);
      expect(result).toBe("SELECT TOP 10\n    a\nFROM\n    [DE]");
    });

    it("lifts TOP (N) with parentheses", () => {
      const input = "SELECT\n    TOP (10)\n    a\nFROM\n    [DE]";
      const result = fixSelectTop(input);
      expect(result).toBe("SELECT TOP (10)\n    a\nFROM\n    [DE]");
    });

    it("lifts TOP N PERCENT", () => {
      const input = "SELECT\n    TOP 50 PERCENT\n    a\nFROM\n    [DE]";
      const result = fixSelectTop(input);
      expect(result).toBe("SELECT TOP 50 PERCENT\n    a\nFROM\n    [DE]");
    });

    it("handles DISTINCT TOP", () => {
      const input = "SELECT DISTINCT\n    TOP 5\n    a\nFROM\n    [DE]";
      const result = fixSelectTop(input);
      expect(result).toBe("SELECT DISTINCT TOP 5\n    a\nFROM\n    [DE]");
    });

    it("preserves nested subquery indentation", () => {
      const input =
        "SELECT\n    a\nFROM\n    (\n        SELECT\n            TOP 5\n            b\n        FROM\n            [Other]\n    )";
      const result = fixSelectTop(input);
      expect(result).toContain("SELECT TOP 5\n");
      expect(result).not.toContain("SELECT\n            TOP 5");
    });

    it("returns input unchanged when no TOP pattern exists", () => {
      const input = "SELECT\n    a\nFROM\n    [DE]";
      const result = fixSelectTop(input);
      expect(result).toBe(input);
    });
  });

  describe("edge cases", () => {
    it("returns empty string for empty input", () => {
      expect(formatSql("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      const result = formatSql("   \n\t  ");
      expect(result).toBe("");
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

    it("formats deeply nested CASE expressions (3 levels)", () => {
      const input =
        "select case when a = 1 then case when b = 2 then case when c = 3 then 'deep' else 'other' end else 'b' end else 'a' end from [DE]";
      const result = formatSql(input);
      expect(result).toContain("CASE");
      expect(result).toContain("\n");
      const caseCount = (result.match(/CASE/g) || []).length;
      expect(caseCount).toBe(3);
    });

    it("returns input unchanged when sql-formatter throws a parse error", () => {
      const input =
        "select Name, case when Type = 'A' then 'yes' else 'no' end from [Products]";
      const result = formatSql(input);
      expect(result).toBe(input);
    });
  });

  describe("trailing semicolon handling", () => {
    it("strips trailing semicolon from single statement", () => {
      const result = formatSql("select * from [DE];");
      expect(result).not.toMatch(/;\s*$/);
    });

    it("strips trailing semicolon with whitespace", () => {
      const result = formatSql("select * from [DE];   ");
      expect(result).not.toMatch(/;\s*$/);
    });

    it("handles multiple statements by preserving internal semicolons", () => {
      const result = formatSql("select * from [A]; select * from [B]");
      expect(result).toContain("SELECT");
      expect(result).not.toMatch(/;\s*$/);
    });
  });

  describe("OFFSET FETCH handling", () => {
    it("uppercases ROWS and ONLY keywords", () => {
      const result = formatSql(
        "select * from [DE] order by x offset 10 rows fetch next 20 rows only",
      );
      expect(result).toContain("ROWS");
      expect(result).toContain("ONLY");
      expect(result).not.toContain("rows");
      expect(result).not.toContain("only");
    });
  });

  describe("stripTrailingSemicolon (unit)", () => {
    it("strips trailing semicolon", () => {
      expect(stripTrailingSemicolon("SELECT * FROM [DE];")).toBe(
        "SELECT * FROM [DE]",
      );
    });

    it("strips semicolon with trailing whitespace", () => {
      expect(stripTrailingSemicolon("SELECT * FROM [DE];  \n")).toBe(
        "SELECT * FROM [DE]",
      );
    });

    it("preserves SQL without trailing semicolon", () => {
      expect(stripTrailingSemicolon("SELECT * FROM [DE]")).toBe(
        "SELECT * FROM [DE]",
      );
    });

    it("preserves internal semicolons", () => {
      const input = "SELECT a; SELECT b";
      expect(stripTrailingSemicolon(input)).toBe(input);
    });
  });

  describe("fixOffsetFetchCase (unit)", () => {
    it("uppercases rows", () => {
      expect(fixOffsetFetchCase("OFFSET 10 rows")).toBe("OFFSET 10 ROWS");
    });

    it("uppercases only", () => {
      expect(fixOffsetFetchCase("FETCH NEXT 20 rows only")).toBe(
        "FETCH NEXT 20 ROWS ONLY",
      );
    });

    it("handles mixed case", () => {
      expect(fixOffsetFetchCase("OFFSET 10 Rows FETCH NEXT 20 Rows Only")).toBe(
        "OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY",
      );
    });

    it("preserves already uppercase", () => {
      expect(fixOffsetFetchCase("OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY")).toBe(
        "OFFSET 10 ROWS FETCH NEXT 20 ROWS ONLY",
      );
    });

    it("handles FETCH FIRST variant", () => {
      expect(fixOffsetFetchCase("FETCH FIRST 5 rows only")).toBe(
        "FETCH FIRST 5 ROWS ONLY",
      );
    });

    it("does not mutate string literals containing rows or only", () => {
      const input = "SELECT 'only rows' FROM [DE]";
      expect(fixOffsetFetchCase(input)).toBe(input);
    });

    it("does not mutate single-quoted only", () => {
      const input = "SELECT 'only' AS flag FROM [DE]";
      expect(fixOffsetFetchCase(input)).toBe(input);
    });

    it("does not mutate single-quoted rows", () => {
      const input = "SELECT 'rows' AS label FROM [DE]";
      expect(fixOffsetFetchCase(input)).toBe(input);
    });

    it("does not mutate inline comments containing rows or only", () => {
      const input = "SELECT a -- only rows here\nFROM [DE]";
      expect(fixOffsetFetchCase(input)).toBe(input);
    });

    it("does not mutate block comments containing rows or only", () => {
      const input = "SELECT a /* only rows */ FROM [DE]";
      expect(fixOffsetFetchCase(input)).toBe(input);
    });

    it("does not mutate column named rows or only", () => {
      const input = "SELECT rows, only FROM [DE]";
      expect(fixOffsetFetchCase(input)).toBe(input);
    });
  });

  describe("moveCommasToLeading (unit)", () => {
    it("moves trailing commas in a column list to leading position", () => {
      const input = "SELECT\n    a,\n    b,\n    c\nFROM\n    [DE]";
      const expected = "SELECT\n    a\n    , b\n    , c\nFROM\n    [DE]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves commas after aliased columns", () => {
      const input = "SELECT\n    col1 AS a,\n    col2 AS b\nFROM\n    [DE]";
      const expected = "SELECT\n    col1 AS a\n    , col2 AS b\nFROM\n    [DE]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves comma after CASE END", () => {
      const input =
        "SELECT\n    CASE\n        WHEN x = 1 THEN 'A'\n        ELSE 'B'\n    END AS flag,\n    col2\nFROM\n    [DE]";
      const expected =
        "SELECT\n    CASE\n        WHEN x = 1 THEN 'A'\n        ELSE 'B'\n    END AS flag\n    , col2\nFROM\n    [DE]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves comma after subquery closing paren", () => {
      const input =
        "SELECT\n    (\n        SELECT\n            COUNT(*)\n        FROM\n            [Orders]\n    ) AS cnt,\n    col2\nFROM\n    [T]";
      const expected =
        "SELECT\n    (\n        SELECT\n            COUNT(*)\n        FROM\n            [Orders]\n    ) AS cnt\n    , col2\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves commas at multiple indent depths (window function)", () => {
      const input =
        "SELECT\n    ROW_NUMBER() OVER (\n        PARTITION BY\n            a,\n            b\n        ORDER BY\n            c\n    ),\n    col2\nFROM\n    [T]";
      const expected =
        "SELECT\n    ROW_NUMBER() OVER (\n        PARTITION BY\n            a\n            , b\n        ORDER BY\n            c\n    )\n    , col2\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves comma before inline comment to leading on next line", () => {
      const input =
        "SELECT\n    col1, -- description\n    col2,\n    col3\nFROM\n    [T]";
      const expected =
        "SELECT\n    col1 -- description\n    , col2\n    , col3\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves comma after block comment", () => {
      const input = "SELECT\n    col1 /* a, b */,\n    col2\nFROM\n    [T]";
      const expected = "SELECT\n    col1 /* a, b */\n    , col2\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves commas in GROUP BY and ORDER BY lists", () => {
      const input =
        "SELECT\n    a,\n    b,\n    COUNT(*)\nFROM\n    [T]\nGROUP BY\n    a,\n    b\nORDER BY\n    a,\n    b";
      const expected =
        "SELECT\n    a\n    , b\n    , COUNT(*)\nFROM\n    [T]\nGROUP BY\n    a\n    , b\nORDER BY\n    a\n    , b";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves comma after nested function calls", () => {
      const input =
        "SELECT\n    CONVERT(VARCHAR(100), DATEADD(day, -7, GETDATE())),\n    col2\nFROM\n    [T]";
      const expected =
        "SELECT\n    CONVERT(VARCHAR(100), DATEADD(day, -7, GETDATE()))\n    , col2\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("does not move commas inside string literals (last item)", () => {
      const input = "SELECT\n    col1,\n    'hello,'\nFROM\n    [T]";
      const expected = "SELECT\n    col1\n    , 'hello,'\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("moves separator comma after string containing commas", () => {
      const input = "SELECT\n    'hello,',\n    col2\nFROM\n    [T]";
      const expected = "SELECT\n    'hello,'\n    , col2\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("handles escaped quotes in strings correctly", () => {
      const input = "SELECT\n    'it''s',\n    col2\nFROM\n    [T]";
      const expected = "SELECT\n    'it''s'\n    , col2\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("preserves inline function argument commas (single line)", () => {
      const input = "SELECT\n    DATEADD(day, -7, GETDATE())\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(input);
    });

    it("preserves inline commas in string literals", () => {
      const input = "SELECT\n    'hello, world' AS greeting\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(input);
    });

    it("passes through single-column queries unchanged", () => {
      const input = "SELECT\n    col1\nFROM\n    [DE]";
      expect(moveCommasToLeading(input)).toBe(input);
    });

    it("passes through empty string unchanged", () => {
      expect(moveCommasToLeading("")).toBe("");
    });

    it("handles PARTITION BY at deeper indent levels", () => {
      const input = "        PARTITION BY\n            a,\n            b";
      const expected = "        PARTITION BY\n            a\n            , b";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("skips lines inside a multi-line block comment", () => {
      const input =
        "SELECT\n    a,\n    /* start\n    middle line\n    end */\n    b\nFROM\n    [T]";
      const expected =
        "SELECT\n    a\n    , /* start\n    middle line\n    end */\n    b\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(expected);
    });

    it("passes through lines with block comment opening without close", () => {
      const input =
        "SELECT\n    a, /* open\n    inside\n    */\n    b\nFROM\n    [T]";
      expect(moveCommasToLeading(input)).toBe(input);
    });
  });

  describe("leading comma formatting (integration)", () => {
    it("outputs leading commas in SELECT column lists", () => {
      const result = formatSql("select a, b, c from [DE]");
      expect(result).toBe("SELECT\n    a\n    , b\n    , c\nFROM\n    [DE]");
    });

    it("outputs leading commas in GROUP BY and ORDER BY", () => {
      const result = formatSql(
        "select a, b, count(*) from [T] group by a, b order by a, b",
      );
      expect(result).toContain("GROUP BY\n    a\n    , b");
      expect(result).toContain("ORDER BY\n    a\n    , b");
    });

    it("moves only list-separator commas, not function-internal commas", () => {
      const result = formatSql(
        "select dateadd(day, -7, getdate()), col2 from [DE]",
      );
      expect(result).toContain("DATEADD(day, -7, GETDATE())");
      expect(result).toContain("\n    , col2");
    });

    it("preserves commas inside string literals while moving list commas", () => {
      const result = formatSql("select 'hello,', col2 from [T]");
      expect(result).toContain("'hello,'");
      expect(result).toContain("\n    , col2");
    });

    it("produces idempotent output with leading commas", () => {
      const original = "select a, b, c from [DE] where x = 1";
      const formatted = formatSql(original);
      const reformatted = formatSql(formatted);
      expect(reformatted).toBe(formatted);
    });
  });
});
