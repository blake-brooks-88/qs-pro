import { areAliasEquivalent } from "./alias-groups";
import type { DEFieldMetadata, ExclusionRule, RelationshipEdge } from "./types";

const CONFIDENCE_ORDER: Record<string, number> = {
  confirmed: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const HIGH_FREQUENCY_THRESHOLD = 5;

function normalize(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function isExcluded(
  sourceDE: string,
  sourceCol: string,
  targetDE: string,
  targetCol: string,
  exclusions: ExclusionRule[],
): boolean {
  return exclusions.some(
    (ex) =>
      (ex.sourceDE === sourceDE &&
        ex.sourceColumn.toLowerCase() === sourceCol.toLowerCase() &&
        ex.targetDE === targetDE &&
        ex.targetColumn.toLowerCase() === targetCol.toLowerCase()) ||
      (ex.sourceDE === targetDE &&
        ex.sourceColumn.toLowerCase() === targetCol.toLowerCase() &&
        ex.targetDE === sourceDE &&
        ex.targetColumn.toLowerCase() === sourceCol.toLowerCase()),
  );
}

export function inferRelationships(
  allDEMetadata: DEFieldMetadata[],
  exclusions: ExclusionRule[],
): RelationshipEdge[] {
  const edges: RelationshipEdge[] = [];

  const columnFrequency = new Map<string, number>();
  for (const de of allDEMetadata) {
    for (const field of de.fields) {
      const norm = normalize(field.name);
      columnFrequency.set(norm, (columnFrequency.get(norm) ?? 0) + 1);
    }
  }

  for (const [i, deA] of allDEMetadata.entries()) {
    for (const deB of allDEMetadata.slice(i + 1)) {
      for (const fieldA of deA.fields) {
        for (const fieldB of deB.fields) {
          if (
            isExcluded(
              deA.deName,
              fieldA.name,
              deB.deName,
              fieldB.name,
              exclusions,
            )
          ) {
            continue;
          }

          const normA = normalize(fieldA.name);
          const normB = normalize(fieldB.name);
          const exactMatch =
            fieldA.name.toLowerCase() === fieldB.name.toLowerCase();
          const normalizedMatch = !exactMatch && normA === normB;
          const aliasMatch =
            !exactMatch &&
            !normalizedMatch &&
            areAliasEquivalent(fieldA.name, fieldB.name);

          if (!exactMatch && !normalizedMatch && !aliasMatch) {
            continue;
          }

          let confidence: RelationshipEdge["confidence"];

          if (aliasMatch) {
            confidence = "medium";
          } else {
            const freq = columnFrequency.get(normA) ?? 0;
            const hasPK = fieldA.isPrimaryKey || fieldB.isPrimaryKey;

            if (hasPK) {
              confidence = "high";
            } else if (freq >= HIGH_FREQUENCY_THRESHOLD) {
              confidence = "low";
            } else {
              confidence = "high";
            }
          }

          edges.push({
            sourceDE: deA.deName,
            sourceColumn: fieldA.name,
            targetDE: deB.deName,
            targetColumn: fieldB.name,
            confidence,
            source: "inferred",
          });
        }
      }
    }
  }

  edges.sort(
    (a, b) =>
      (CONFIDENCE_ORDER[a.confidence] ?? 99) -
      (CONFIDENCE_ORDER[b.confidence] ?? 99),
  );

  return edges;
}
