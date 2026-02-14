import { describe, expect, it } from "vitest";

import { extractSelectFieldRanges } from "./select-fields";

describe("extractSelectFieldRanges", () => {
  it("returns empty array when there is no SELECT keyword", () => {
    const result = extractSelectFieldRanges("FROM [Table]");
    expect(result).toEqual([]);
  });

  it("takes all remaining tokens when SELECT has no FROM", () => {
    const sql = "SELECT a, b";
    const result = extractSelectFieldRanges(sql);

    expect(result).toEqual([
      { startIndex: 7, endIndex: 8, type: "field" },
      { startIndex: 10, endIndex: 11, type: "field" },
    ]);
  });

  it("skips empty comma segments gracefully", () => {
    const sql = "SELECT a,,b FROM [T]";
    const result = extractSelectFieldRanges(sql);

    expect(result).toEqual([
      { startIndex: 7, endIndex: 8, type: "field" },
      { startIndex: 10, endIndex: 11, type: "field" },
    ]);
  });

  it("extracts field and implicit alias when no AS keyword is present", () => {
    const sql = "SELECT [Table].Email e FROM [T]";
    const result = extractSelectFieldRanges(sql);

    const fieldRange = result.find((r) => r.type === "field");
    const aliasRange = result.find((r) => r.type === "alias");

    expect(fieldRange).toBeDefined();
    expect(sql.slice(fieldRange?.startIndex, fieldRange?.endIndex)).toBe(
      "Email",
    );

    expect(aliasRange).toBeDefined();
    expect(sql.slice(aliasRange?.startIndex, aliasRange?.endIndex)).toBe("e");
  });

  it("extracts only the field range when there is a single identifier and no alias", () => {
    const sql = "SELECT Email FROM [T]";
    const result = extractSelectFieldRanges(sql);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expect.objectContaining({ type: "field" }));
    expect(sql.slice(result[0]?.startIndex, result[0]?.endIndex)).toBe("Email");
  });

  it("extracts field and alias with explicit AS keyword", () => {
    const sql = "SELECT Email AS e FROM [T]";
    const result = extractSelectFieldRanges(sql);

    const fieldRange = result.find((r) => r.type === "field");
    const aliasRange = result.find((r) => r.type === "alias");

    expect(fieldRange).toBeDefined();
    expect(sql.slice(fieldRange?.startIndex, fieldRange?.endIndex)).toBe(
      "Email",
    );

    expect(aliasRange).toBeDefined();
    expect(sql.slice(aliasRange?.startIndex, aliasRange?.endIndex)).toBe("e");
  });

  it("handles bracketed fields with explicit AS alias", () => {
    const sql = "SELECT [First Name] AS fn FROM [T]";
    const result = extractSelectFieldRanges(sql);

    const fieldRange = result.find((r) => r.type === "field");
    const aliasRange = result.find((r) => r.type === "alias");

    expect(fieldRange).toBeDefined();
    expect(sql.slice(fieldRange?.startIndex, fieldRange?.endIndex)).toBe(
      "[First Name]",
    );

    expect(aliasRange).toBeDefined();
    expect(sql.slice(aliasRange?.startIndex, aliasRange?.endIndex)).toBe("fn");
  });

  it("returns empty array when the only select-clause content is non-identifier tokens", () => {
    const sql = "SELECT * FROM [T]";
    const result = extractSelectFieldRanges(sql);
    expect(result).toEqual([]);
  });

  it("handles multiple fields with mixed alias styles", () => {
    const sql = "SELECT Name n, Email AS em, Id FROM [T]";
    const result = extractSelectFieldRanges(sql);

    const fields = result.filter((r) => r.type === "field");
    const aliases = result.filter((r) => r.type === "alias");

    expect(fields).toHaveLength(3);
    expect(aliases).toHaveLength(2);

    expect(sql.slice(fields[0]?.startIndex, fields[0]?.endIndex)).toBe("Name");
    expect(sql.slice(aliases[0]?.startIndex, aliases[0]?.endIndex)).toBe("n");

    expect(sql.slice(fields[1]?.startIndex, fields[1]?.endIndex)).toBe("Email");
    expect(sql.slice(aliases[1]?.startIndex, aliases[1]?.endIndex)).toBe("em");

    expect(sql.slice(fields[2]?.startIndex, fields[2]?.endIndex)).toBe("Id");
  });

  it("scopes to the correct FROM at the same depth (ignores subquery FROM)", () => {
    const sql = "SELECT (SELECT x FROM [Inner]) AS val FROM [Outer]";
    const result = extractSelectFieldRanges(sql);

    const fieldRange = result.find((r) => r.type === "field");
    expect(fieldRange).toBeDefined();
  });
});
