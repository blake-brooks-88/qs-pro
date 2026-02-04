import { MC } from "@/constants/marketing-cloud";
import {
  extractTableReferences,
  type SqlTableReference,
} from "@/features/editor-workspace/utils/sql-context";

import type { LintContext, LintRule, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";

/**
 * Normalizes table names for comparison (removes brackets, lowercases).
 */
const normalizeTableName = (name: string): string => {
  return name
    .replace(/^\[|\]$/g, "")
    .trim()
    .toLowerCase();
};

/**
 * Finds the positions of set operators (UNION, INTERSECT, EXCEPT) in SQL.
 * Returns an array of indices where these operators start.
 * These operators separate independent SELECT statements that should not be
 * treated as self-joins.
 */
const findSetOperatorPositions = (sql: string): number[] => {
  const positions: number[] = [];
  const upperSql = sql.toUpperCase();

  // Match UNION ALL first (longer match), then UNION, INTERSECT, EXCEPT
  const patterns = [
    { regex: /\bUNION\s+ALL\b/gi, keyword: "UNION ALL" },
    { regex: /\bUNION\b/gi, keyword: "UNION" },
    { regex: /\bINTERSECT\b/gi, keyword: "INTERSECT" },
    { regex: /\bEXCEPT\b/gi, keyword: "EXCEPT" },
  ];

  const foundPositions = new Set<number>();

  for (const { regex } of patterns) {
    let match: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((match = regex.exec(upperSql)) !== null) {
      // Only add if not already found (avoid UNION being found after UNION ALL)
      if (!foundPositions.has(match.index)) {
        foundPositions.add(match.index);
        positions.push(match.index);
      }
    }
  }

  return positions.sort((a, b) => a - b);
};

/**
 * Groups table references by their SELECT statement scope.
 * Tables in separate SELECT statements (divided by UNION/INTERSECT/EXCEPT)
 * should not be considered as self-joins.
 */
const groupReferencesBySelectScope = (
  sql: string,
  references: SqlTableReference[],
): SqlTableReference[][] => {
  const setOperatorPositions = findSetOperatorPositions(sql);

  if (setOperatorPositions.length === 0) {
    // No set operators - all references are in the same scope
    return [references];
  }

  // Create boundaries: [0, pos1, pos2, ..., sql.length]
  const boundaries = [0, ...setOperatorPositions, sql.length];
  const groups: SqlTableReference[][] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const start = boundaries[i] ?? 0;
    const end = boundaries[i + 1] ?? sql.length;

    // Find references within this boundary
    const scopeRefs = references.filter(
      (ref) => ref.startIndex >= start && ref.startIndex < end,
    );

    if (scopeRefs.length > 0) {
      groups.push(scopeRefs);
    }
  }

  return groups;
};

/**
 * Detects when a table is joined to itself without different aliases.
 * Only checks within the same SELECT scope - tables in separate SELECT
 * statements (divided by UNION/INTERSECT/EXCEPT) are not self-joins.
 */
const getSelfJoinSameAliasDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const allReferences = extractTableReferences(sql).filter(
    (ref) => !ref.isSubquery,
  );

  if (allReferences.length < 2) {
    return diagnostics;
  }

  // Group references by SELECT scope (separated by UNION/INTERSECT/EXCEPT)
  const referenceGroups = groupReferencesBySelectScope(sql, allReferences);

  // Check for self-joins within each scope, not across scopes
  for (const references of referenceGroups) {
    if (references.length < 2) {
      continue;
    }

    checkScopeForSelfJoins(references, diagnostics);
  }

  return diagnostics;
};

/**
 * Checks a single SELECT scope for self-joins without distinct aliases.
 */
const checkScopeForSelfJoins = (
  references: SqlTableReference[],
  diagnostics: SqlDiagnostic[],
): void => {
  // Track table names and their aliases within this scope
  const tableOccurrences = new Map<
    string,
    Array<{
      alias: string | undefined;
      startIndex: number;
      endIndex: number;
      name: string;
    }>
  >();

  for (const ref of references) {
    const normalizedName = normalizeTableName(ref.name);
    const existing = tableOccurrences.get(normalizedName) ?? [];
    existing.push({
      alias: ref.alias,
      startIndex: ref.startIndex,
      endIndex: ref.endIndex,
      name: ref.name,
    });
    tableOccurrences.set(normalizedName, existing);
  }

  // Check for self-joins
  for (const occurrences of tableOccurrences.values()) {
    if (occurrences.length < 2) {
      continue;
    }

    // This is a self-join - check if aliases are distinct
    for (let i = 0; i < occurrences.length; i++) {
      for (let j = i + 1; j < occurrences.length; j++) {
        const first = occurrences.at(i);
        const second = occurrences.at(j);
        if (!first || !second) {
          continue;
        }

        // Check if both have no alias, or if they have the same alias
        const bothNoAlias = !first.alias && !second.alias;
        const sameAlias =
          first.alias &&
          first.alias.toLowerCase() === second.alias?.toLowerCase();

        if (bothNoAlias || sameAlias) {
          // Report error on the second occurrence
          diagnostics.push(
            createDiagnostic(
              `Self-join detected: table "${second.name}" appears multiple times ${sameAlias ? `with same alias "${second.alias}"` : "without distinct aliases"}. ${MC.SHORT} requires different aliases for self-joins. Example: \`FROM [${second.name}] a JOIN [${second.name}] b ON ...\`.`,
              "error",
              second.startIndex,
              second.endIndex,
            ),
          );
        }
      }
    }
  }
};

/**
 * Rule to detect self-joins without distinct aliases.
 * MCE SQL requires different aliases when joining a table to itself.
 */
export const selfJoinSameAliasRule: LintRule = {
  id: "self-join-same-alias",
  name: "Self-Join Same Alias",
  check: (context: LintContext) => {
    return getSelfJoinSameAliasDiagnostics(context.sql);
  },
};
