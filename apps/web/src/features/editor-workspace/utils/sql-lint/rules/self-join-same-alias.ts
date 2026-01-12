import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { extractTableReferences } from "../../sql-context";
import { MC } from "@/constants/marketing-cloud";

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
 * Detects when a table is joined to itself without different aliases.
 */
const getSelfJoinSameAliasDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const references = extractTableReferences(sql).filter(
    (ref) => !ref.isSubquery,
  );

  if (references.length < 2) return diagnostics;

  // Track table names and their aliases
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
    if (occurrences.length < 2) continue;

    // This is a self-join - check if aliases are distinct
    for (let i = 0; i < occurrences.length; i++) {
      for (let j = i + 1; j < occurrences.length; j++) {
        const first = occurrences[i];
        const second = occurrences[j];

        // Check if both have no alias, or if they have the same alias
        const bothNoAlias = !first.alias && !second.alias;
        const sameAlias =
          first.alias &&
          second.alias &&
          first.alias.toLowerCase() === second.alias.toLowerCase();

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

  return diagnostics;
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
