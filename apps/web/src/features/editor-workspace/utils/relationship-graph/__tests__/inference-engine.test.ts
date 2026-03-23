import { describe, expect, it } from "vitest";

import { inferRelationships } from "../inference-engine";
import type { DEFieldMetadata, ExclusionRule } from "../types";

function mkDE(
  name: string,
  fields: Array<{ name: string; isPrimaryKey?: boolean; fieldType?: string }>,
): DEFieldMetadata {
  return {
    deName: name,
    fields: fields.map((f) => ({
      name: f.name,
      fieldType: f.fieldType ?? "Text",
      isPrimaryKey: f.isPrimaryKey ?? false,
    })),
  };
}

describe("inferRelationships", () => {
  it("produces a high-confidence edge when two DEs share a PK column name", () => {
    const metadata: DEFieldMetadata[] = [
      mkDE("Orders", [
        { name: "ContactId", isPrimaryKey: true },
        { name: "Amount" },
      ]),
      mkDE("Contacts", [
        { name: "ContactId", isPrimaryKey: true },
        { name: "Name" },
      ]),
    ];

    const edges = inferRelationships(metadata, []);

    const contactEdge = edges.find(
      (e) =>
        e.sourceColumn.toLowerCase() === "contactid" &&
        e.targetColumn.toLowerCase() === "contactid",
    );
    expect(contactEdge).toBeDefined();
    expect(contactEdge?.confidence).toBe("high");
    expect(contactEdge?.source).toBe("inferred");
  });

  it("produces a medium-confidence edge for alias-equivalent columns", () => {
    const metadata: DEFieldMetadata[] = [
      mkDE("Sends", [{ name: "SubscriberKey", isPrimaryKey: true }]),
      mkDE("Contacts", [{ name: "ContactKey", isPrimaryKey: true }]),
    ];

    const edges = inferRelationships(metadata, []);

    const aliasEdge = edges.find(
      (e) =>
        (e.sourceColumn === "SubscriberKey" &&
          e.targetColumn === "ContactKey") ||
        (e.sourceColumn === "ContactKey" && e.targetColumn === "SubscriberKey"),
    );
    expect(aliasEdge).toBeDefined();
    expect(aliasEdge?.confidence).toBe("medium");
  });

  it("drops inferred edges when neither side is a PK", () => {
    const des: DEFieldMetadata[] = Array.from({ length: 6 }, (_, idx) =>
      mkDE(`DE_${idx}`, [{ name: "Status" }]),
    );

    const edges = inferRelationships(des, []);

    const statusEdges = edges.filter(
      (e) =>
        e.sourceColumn.toLowerCase() === "status" &&
        e.targetColumn.toLowerCase() === "status",
    );
    expect(statusEdges).toHaveLength(0);
  });

  it("demotes high-frequency PK columns to low confidence", () => {
    const des: DEFieldMetadata[] = Array.from({ length: 6 }, (_, idx) =>
      mkDE(`DE_${idx}`, [{ name: "Status", isPrimaryKey: true }]),
    );

    const edges = inferRelationships(des, []);

    const statusEdges = edges.filter(
      (e) =>
        e.sourceColumn.toLowerCase() === "status" &&
        e.targetColumn.toLowerCase() === "status",
    );
    expect(statusEdges.length).toBeGreaterThan(0);
    expect(statusEdges.every((e) => e.confidence === "low")).toBe(true);
  });

  it("suppresses edges matching an exclusion rule", () => {
    const metadata: DEFieldMetadata[] = [
      mkDE("Orders", [{ name: "AccountId", isPrimaryKey: true }]),
      mkDE("Invoices", [{ name: "AccountId", isPrimaryKey: true }]),
    ];

    const exclusions: ExclusionRule[] = [
      {
        sourceDE: "Orders",
        sourceColumn: "AccountId",
        targetDE: "Invoices",
        targetColumn: "AccountId",
      },
    ];

    const edges = inferRelationships(metadata, exclusions);

    const accountEdge = edges.find(
      (e) =>
        e.sourceColumn.toLowerCase() === "accountid" &&
        e.targetColumn.toLowerCase() === "accountid",
    );
    expect(accountEdge).toBeUndefined();
  });

  it("checks exclusions bidirectionally", () => {
    const metadata: DEFieldMetadata[] = [
      mkDE("A", [{ name: "LinkId", isPrimaryKey: true }]),
      mkDE("B", [{ name: "LinkId", isPrimaryKey: true }]),
    ];

    const exclusions: ExclusionRule[] = [
      {
        sourceDE: "B",
        sourceColumn: "LinkId",
        targetDE: "A",
        targetColumn: "LinkId",
      },
    ];

    const edges = inferRelationships(metadata, exclusions);
    expect(edges).toHaveLength(0);
  });

  it("returns edges sorted by confidence tier", () => {
    const metadata: DEFieldMetadata[] = [
      mkDE("D1", [
        { name: "SubscriberKey", isPrimaryKey: true },
        { name: "SharedCol", isPrimaryKey: true },
      ]),
      mkDE("D2", [
        { name: "_ContactKey", isPrimaryKey: true },
        { name: "SharedCol", isPrimaryKey: true },
      ]),
    ];

    const edges = inferRelationships(metadata, []);
    const tierOrder: Record<string, number> = {
      confirmed: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    const tierValues = edges.map((e) => tierOrder[e.confidence] ?? 99);
    for (let k = 1; k < tierValues.length; k++) {
      const current = tierValues[k] ?? 99;
      const previous = tierValues[k - 1] ?? 99;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
  });

  it("returns empty array for empty input", () => {
    expect(inferRelationships([], [])).toEqual([]);
  });
});
