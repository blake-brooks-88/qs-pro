import { describe, expect, it } from "vitest";

import { extractJoinConditions } from "../extract-join-conditions";

describe("extractJoinConditions", () => {
  it("extracts a single JOIN ON condition", () => {
    const sql = "SELECT * FROM A a JOIN B b ON a.id = b.a_id";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([
      {
        leftTable: "A",
        leftColumn: "id",
        rightTable: "B",
        rightColumn: "a_id",
      },
    ]);
  });

  it("handles reverse ON order", () => {
    const sql = "SELECT * FROM A a JOIN B b ON b.a_id = a.id";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([
      {
        leftTable: "B",
        leftColumn: "a_id",
        rightTable: "A",
        rightColumn: "id",
      },
    ]);
  });

  it("extracts multiple JOINs", () => {
    const sql =
      "SELECT * FROM A a JOIN B b ON a.id = b.a_id JOIN C c ON b.id = c.b_id";
    const result = extractJoinConditions(sql);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      leftTable: "A",
      leftColumn: "id",
      rightTable: "B",
      rightColumn: "a_id",
    });
    expect(result[1]).toEqual({
      leftTable: "B",
      leftColumn: "id",
      rightTable: "C",
      rightColumn: "b_id",
    });
  });

  it("extracts multi-condition ON clause (AND)", () => {
    const sql = "SELECT * FROM A a JOIN B b ON a.id = b.a_id AND a.key = b.key";
    const result = extractJoinConditions(sql);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      leftTable: "A",
      leftColumn: "id",
      rightTable: "B",
      rightColumn: "a_id",
    });
    expect(result[1]).toEqual({
      leftTable: "A",
      leftColumn: "key",
      rightTable: "B",
      rightColumn: "key",
    });
  });

  it("returns empty array when no JOINs", () => {
    const sql = "SELECT * FROM A WHERE A.id = 1";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([]);
  });

  it("resolves ENT-qualified table names", () => {
    const sql =
      "SELECT * FROM ENT.Subscribers s JOIN ENT.Orders o ON s.SubscriberKey = o.CustomerKey";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([
      {
        leftTable: "ENT.Subscribers",
        leftColumn: "SubscriberKey",
        rightTable: "ENT.Orders",
        rightColumn: "CustomerKey",
      },
    ]);
  });

  it("skips subquery JOINs", () => {
    const sql =
      "SELECT * FROM A a JOIN (SELECT id FROM B) sub ON a.id = sub.id";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([]);
  });
});
