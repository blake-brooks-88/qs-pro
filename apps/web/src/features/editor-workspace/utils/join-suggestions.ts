import { useCallback } from "react";
import type { DataExtensionField } from "@/features/editor-workspace/types";
import type { SqlTableReference } from "./sql-context";

export interface JoinSuggestion {
  text: string;
}

export type JoinSuggestionOverride = (options: {
  leftTable: SqlTableReference;
  rightTable: SqlTableReference;
  leftFields: DataExtensionField[];
  rightFields: DataExtensionField[];
}) => JoinSuggestion[];

export type JoinSuggestionOverrides = Map<string, JoinSuggestionOverride>;

const normalizeField = (name: string) =>
  name.replace(/[^a-z0-9]/gi, "").toLowerCase();

const getOverrideKey = (left: SqlTableReference, right: SqlTableReference) => {
  return `${left.qualifiedName}|${right.qualifiedName}`.toLowerCase();
};

const resolveOverrides = (
  overrides: JoinSuggestionOverrides,
  left: SqlTableReference,
  right: SqlTableReference,
) => {
  const key = getOverrideKey(left, right);
  return (
    overrides.get(key) ||
    overrides.get(right.qualifiedName.toLowerCase()) ||
    overrides.get(left.qualifiedName.toLowerCase())
  );
};

const buildFuzzyJoinSuggestions = (
  leftTable: SqlTableReference,
  rightTable: SqlTableReference,
  leftFields: DataExtensionField[],
  rightFields: DataExtensionField[],
) => {
  const leftAlias = leftTable.alias ?? leftTable.qualifiedName;
  const rightAlias = rightTable.alias ?? rightTable.qualifiedName;

  const rightMap = new Map(
    rightFields.map((field) => [normalizeField(field.name), field.name]),
  );

  const suggestions: JoinSuggestion[] = [];

  leftFields.forEach((field) => {
    const normalized = normalizeField(field.name);
    const rightMatch = rightMap.get(normalized);
    if (!rightMatch) return;
    suggestions.push({
      text: `${leftAlias}.${field.name} = ${rightAlias}.${rightMatch}`,
    });
  });

  return suggestions.slice(0, 3);
};

/**
 * Returns join suggestions for two tables using overrides or fuzzy field matching.
 */
export const useJoinSuggestions = (
  overrides: JoinSuggestionOverrides = new Map(),
) => {
  return useCallback(
    (options: {
      leftTable: SqlTableReference;
      rightTable: SqlTableReference;
      leftFields: DataExtensionField[];
      rightFields: DataExtensionField[];
    }): JoinSuggestion[] => {
      const override = resolveOverrides(
        overrides,
        options.leftTable,
        options.rightTable,
      );
      if (override) {
        return override(options);
      }
      return buildFuzzyJoinSuggestions(
        options.leftTable,
        options.rightTable,
        options.leftFields,
        options.rightFields,
      );
    },
    [overrides],
  );
};
