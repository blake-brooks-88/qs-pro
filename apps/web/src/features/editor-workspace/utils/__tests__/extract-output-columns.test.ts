import { describe, expect, it } from "vitest";

import { extractOutputColumnNames } from "../extract-output-columns";

describe("extractOutputColumnNames", () => {
  it("extracts simple column names", () => {
    const result = extractOutputColumnNames("SELECT Email, Name FROM [DE]");

    expect(result).toEqual({ ok: true, names: ["Email", "Name"] });
  });

  it("extracts aliased column names using the alias", () => {
    const result = extractOutputColumnNames("SELECT col AS alias FROM [DE]");

    expect(result).toEqual({ ok: true, names: ["alias"] });
  });

  it("extracts mixed columns using alias when present", () => {
    const result = extractOutputColumnNames("SELECT a, b AS c FROM [DE]");

    expect(result).toEqual({ ok: true, names: ["a", "c"] });
  });

  it("rejects SELECT * queries", () => {
    const result = extractOutputColumnNames("SELECT * FROM [DE]");

    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain(
      "SELECT *",
    );
  });

  it("rejects computed columns without an explicit alias", () => {
    const result = extractOutputColumnNames("SELECT CONCAT(a,b) FROM [DE]");

    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toContain(
      "AS alias",
    );
  });

  it("extracts bracket-escaped identifiers correctly", () => {
    const result = extractOutputColumnNames("SELECT [First Name] FROM [DE]");

    expect(result).toEqual({ ok: true, names: ["First Name"] });
  });
});
