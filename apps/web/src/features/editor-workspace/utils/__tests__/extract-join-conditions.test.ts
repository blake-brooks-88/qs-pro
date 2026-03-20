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

  it("extracts conditions with bracketed column names", () => {
    const sql =
      "SELECT * FROM [My DE] a JOIN [Other DE] b ON a.[Contact Key] = b.[Contact Key]";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([
      {
        leftTable: "My DE",
        leftColumn: "Contact Key",
        rightTable: "Other DE",
        rightColumn: "Contact Key",
      },
    ]);
  });

  it("extracts conditions with fully bracketed identifiers", () => {
    const sql =
      "SELECT * FROM [My DE] a JOIN [Other DE] b ON [My DE].[Contact Key] = [Other DE].[Email]";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([
      {
        leftTable: "My DE",
        leftColumn: "Contact Key",
        rightTable: "Other DE",
        rightColumn: "Email",
      },
    ]);
  });

  it("extracts conditions with mixed bare and bracketed identifiers", () => {
    const sql =
      "SELECT * FROM Subscribers s JOIN [Order History] o ON s.SubscriberKey = o.[Subscriber Key]";
    const result = extractJoinConditions(sql);

    expect(result).toEqual([
      {
        leftTable: "Subscribers",
        leftColumn: "SubscriberKey",
        rightTable: "Order History",
        rightColumn: "Subscriber Key",
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
