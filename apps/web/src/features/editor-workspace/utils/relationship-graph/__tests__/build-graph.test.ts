import { describe, expect, it } from "vitest";

import { buildRelationshipGraph } from "../build-graph";
import type {
  DEFieldMetadata,
  ExclusionRule,
  RelationshipEdge,
} from "../types";

function mkEdge(
  overrides: Partial<RelationshipEdge> & {
    sourceDE: string;
    sourceColumn: string;
    targetDE: string;
    targetColumn: string;
  },
): RelationshipEdge {
  return {
    confidence: "confirmed",
    source: "attribute_group",
    ...overrides,
  };
}

function mkDE(
  name: string,
  fields: Array<{ name: string; isPrimaryKey?: boolean }>,
): DEFieldMetadata {
  return {
    deName: name,
    fields: fields.map((f) => ({
      name: f.name,
      fieldType: "Text",
      isPrimaryKey: f.isPrimaryKey ?? false,
    })),
  };
}

describe("buildRelationshipGraph", () => {
  it("includes confirmed edges from API and user sources", () => {
    const apiEdge = mkEdge({
      sourceDE: "A",
      sourceColumn: "Id",
      targetDE: "B",
      targetColumn: "Id",
    });
    const userEdge = mkEdge({
      sourceDE: "C",
      sourceColumn: "Key",
      targetDE: "D",
      targetColumn: "Key",
      source: "user",
    });

    const graph = buildRelationshipGraph([apiEdge], [userEdge], [], []);

    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0]?.confidence).toBe("confirmed");
    expect(graph.edges[0]?.source).toBe("attribute_group");
    expect(graph.edges[1]?.confidence).toBe("confirmed");
    expect(graph.edges[1]?.source).toBe("user");
  });

  it("drops inferred edges that duplicate confirmed edges", () => {
    const apiEdge = mkEdge({
      sourceDE: "Orders",
      sourceColumn: "ContactId",
      targetDE: "Contacts",
      targetColumn: "ContactId",
    });

    const metadata: DEFieldMetadata[] = [
      mkDE("Orders", [{ name: "ContactId", isPrimaryKey: true }]),
      mkDE("Contacts", [{ name: "ContactId", isPrimaryKey: true }]),
    ];

    const graph = buildRelationshipGraph([apiEdge], [], [], metadata);

    const contactEdges = graph.edges.filter(
      (e) =>
        e.sourceColumn.toLowerCase() === "contactid" &&
        e.targetColumn.toLowerCase() === "contactid",
    );
    expect(contactEdges).toHaveLength(1);
    expect(contactEdges[0]?.confidence).toBe("confirmed");
  });

  it("suppresses inferred edges via exclusion rules", () => {
    const metadata: DEFieldMetadata[] = [
      mkDE("A", [{ name: "SharedId", isPrimaryKey: true }]),
      mkDE("B", [{ name: "SharedId", isPrimaryKey: true }]),
    ];

    const exclusions: ExclusionRule[] = [
      {
        sourceDE: "A",
        sourceColumn: "SharedId",
        targetDE: "B",
        targetColumn: "SharedId",
      },
    ];

    const graph = buildRelationshipGraph([], [], exclusions, metadata);

    expect(graph.edges).toHaveLength(0);
    expect(graph.exclusions).toEqual(exclusions);
  });

  it("returns empty graph for empty inputs", () => {
    const graph = buildRelationshipGraph([], [], [], []);

    expect(graph.edges).toEqual([]);
    expect(graph.exclusions).toEqual([]);
  });

  it("sorts edges with confirmed before inferred", () => {
    const apiEdge = mkEdge({
      sourceDE: "X",
      sourceColumn: "Id",
      targetDE: "Y",
      targetColumn: "Id",
    });

    const metadata: DEFieldMetadata[] = [
      mkDE("A", [{ name: "LinkCol", isPrimaryKey: true }]),
      mkDE("B", [{ name: "LinkCol", isPrimaryKey: true }]),
      mkDE("X", [{ name: "Id", isPrimaryKey: true }]),
      mkDE("Y", [{ name: "Id", isPrimaryKey: true }]),
    ];

    const graph = buildRelationshipGraph([apiEdge], [], [], metadata);

    const confirmedIdx = graph.edges.findIndex(
      (e) => e.confidence === "confirmed",
    );
    const inferredIdx = graph.edges.findIndex(
      (e) => e.confidence !== "confirmed",
    );
    expect(confirmedIdx).not.toBe(-1);
    expect(inferredIdx).not.toBe(-1);
    expect(confirmedIdx).toBeLessThan(inferredIdx);
  });
});
