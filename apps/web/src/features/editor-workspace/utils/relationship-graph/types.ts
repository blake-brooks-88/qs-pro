export type ConfidenceTier = "confirmed" | "high" | "medium" | "low";
export type EdgeSource = "attribute_group" | "user" | "inferred";

export interface RelationshipEdge {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
  confidence: ConfidenceTier;
  source: EdgeSource;
  ruleId?: string;
}

export interface ExclusionRule {
  sourceDE: string;
  sourceColumn: string;
  targetDE: string;
  targetColumn: string;
}

export interface RelationshipGraph {
  edges: RelationshipEdge[];
  exclusions: ExclusionRule[];
}

export interface RelationshipGraphResponse {
  edges: RelationshipEdge[];
  exclusions: ExclusionRule[];
}

export interface DEFieldMetadata {
  deName: string;
  fields: Array<{
    name: string;
    fieldType: string;
    isPrimaryKey: boolean;
  }>;
}
