import { describe, expect, it } from "vitest";

import { extractTableReferences } from "./table-references";

describe("extractTableReferences", () => {
  it("extracts a table with ENT. prefix", () => {
    const sql = "SELECT * FROM ENT.[SharedDE]";
    const refs = extractTableReferences(sql);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.name).toBe("SharedDE");
    expect(refs[0]?.qualifiedName).toBe("ENT.SharedDE");
    expect(refs[0]?.isBracketed).toBe(true);
    expect(refs[0]?.isSubquery).toBe(false);
  });

  it("captures alias on an ENT-prefixed table", () => {
    const sql = "SELECT * FROM ENT.[SharedDE] s";
    const refs = extractTableReferences(sql);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.qualifiedName).toBe("ENT.SharedDE");
    expect(refs[0]?.alias).toBe("s");
  });

  it("extracts a subquery without an alias", () => {
    const sql = "SELECT * FROM (SELECT ID FROM [A])";
    const refs = extractTableReferences(sql);

    const subquery = refs.find((r) => r.isSubquery);
    expect(subquery).toBeDefined();
    expect(subquery?.alias).toBeUndefined();
    expect(subquery?.outputFields).toContain("ID");
  });

  it("deduplicates output fields from a subquery", () => {
    const sql = "SELECT * FROM (SELECT ID, Name, ID FROM [A]) sub";
    const refs = extractTableReferences(sql);

    const subquery = refs.find((r) => r.isSubquery);
    expect(subquery).toBeDefined();
    expect(subquery?.outputFields).toEqual(["ID", "Name"]);
  });

  it("skips consecutive commas between FROM and table name", () => {
    const sql = "SELECT * FROM ,,[A]";
    const refs = extractTableReferences(sql);

    const table = refs.find((r) => r.name === "A");
    expect(table).toBeDefined();
    expect(table?.isBracketed).toBe(true);
  });

  it("extracts multiple tables from JOINs", () => {
    const sql = "SELECT * FROM [A] a JOIN [B] b JOIN [C] c";
    const refs = extractTableReferences(sql);

    expect(refs).toHaveLength(3);
    expect(refs[0]?.name).toBe("A");
    expect(refs[0]?.alias).toBe("a");
    expect(refs[1]?.name).toBe("B");
    expect(refs[1]?.alias).toBe("b");
    expect(refs[2]?.name).toBe("C");
    expect(refs[2]?.alias).toBe("c");
  });

  it("assigns correct scopeDepth for tables in nested subqueries", () => {
    const sql = "SELECT * FROM [Outer] WHERE ID IN (SELECT ID FROM [Inner])";
    const refs = extractTableReferences(sql);

    const outer = refs.find((r) => r.name === "Outer");
    const inner = refs.find((r) => r.name === "Inner");

    expect(outer).toBeDefined();
    expect(outer?.scopeDepth).toBe(0);
    expect(inner).toBeDefined();
    expect(inner?.scopeDepth).toBe(1);
  });

  it("extracts subquery with AS alias syntax", () => {
    const sql = "SELECT * FROM (SELECT ID FROM [A]) AS sub";
    const refs = extractTableReferences(sql);

    const subquery = refs.find((r) => r.isSubquery);
    expect(subquery).toBeDefined();
    expect(subquery?.alias).toBe("sub");
  });

  it("extracts an unbracketed table name", () => {
    const sql = "SELECT * FROM MyTable t";
    const refs = extractTableReferences(sql);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.name).toBe("MyTable");
    expect(refs[0]?.alias).toBe("t");
    expect(refs[0]?.isBracketed).toBe(false);
  });

  it("returns empty output fields for non-subquery tables", () => {
    const sql = "SELECT * FROM [A]";
    const refs = extractTableReferences(sql);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.outputFields).toEqual([]);
  });

  it("handles ENT prefix with unbracketed table name", () => {
    const sql = "SELECT * FROM ENT.SharedDE";
    const refs = extractTableReferences(sql);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.name).toBe("SharedDE");
    expect(refs[0]?.qualifiedName).toBe("ENT.SharedDE");
    expect(refs[0]?.isBracketed).toBe(false);
  });
});
