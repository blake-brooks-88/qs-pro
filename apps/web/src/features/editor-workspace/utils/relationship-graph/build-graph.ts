import { inferRelationships } from "./inference-engine";
import type {
  DEFieldMetadata,
  ExclusionRule,
  RelationshipEdge,
  RelationshipGraph,
} from "./types";

function edgesMatch(a: RelationshipEdge, b: RelationshipEdge): boolean {
  return (
    (a.sourceDE === b.sourceDE &&
      a.sourceColumn.toLowerCase() === b.sourceColumn.toLowerCase() &&
      a.targetDE === b.targetDE &&
      a.targetColumn.toLowerCase() === b.targetColumn.toLowerCase()) ||
    (a.sourceDE === b.targetDE &&
      a.sourceColumn.toLowerCase() === b.targetColumn.toLowerCase() &&
      a.targetDE === b.sourceDE &&
      a.targetColumn.toLowerCase() === b.sourceColumn.toLowerCase())
  );
}

export function buildRelationshipGraph(
  apiEdges: RelationshipEdge[],
  userEdges: RelationshipEdge[],
  exclusions: ExclusionRule[],
  allDEMetadata: DEFieldMetadata[],
): RelationshipGraph {
  const confirmedEdges: RelationshipEdge[] = [
    ...apiEdges.map((e) => ({
      ...e,
      confidence: "confirmed" as const,
      source: "attribute_group" as const,
    })),
    ...userEdges.map((e) => ({
      ...e,
      confidence: "confirmed" as const,
      source: "user" as const,
    })),
  ];

  const inferredEdges = inferRelationships(allDEMetadata, exclusions);

  const deduplicatedInferred = inferredEdges.filter(
    (inferred) =>
      !confirmedEdges.some((confirmed) => edgesMatch(confirmed, inferred)),
  );

  return {
    edges: [...confirmedEdges, ...deduplicatedInferred],
    exclusions,
  };
}
