import type { LintRule, LintContext, SqlDiagnostic } from "../types";
import { createDiagnostic } from "../utils/helpers";
import { extractTableReferences } from "../../sql-context";
import { MC } from "@/constants/marketing-cloud";

/**
 * Detects duplicate table aliases in FROM and JOIN clauses.
 */
const getDuplicateTableAliasDiagnostics = (sql: string): SqlDiagnostic[] => {
  const diagnostics: SqlDiagnostic[] = [];
  const references = extractTableReferences(sql).filter(
    (ref) => !ref.isSubquery && ref.alias,
  );

  // Track aliases we've seen and their positions
  const aliasMap = new Map<
    string,
    { alias: string; startIndex: number; endIndex: number }[]
  >();

  for (const ref of references) {
    if (!ref.alias) continue;

    const aliasLower = ref.alias.toLowerCase();
    const existing = aliasMap.get(aliasLower) ?? [];

    // Store the alias occurrence with its position
    // The alias position is after the table name
    existing.push({
      alias: ref.alias,
      startIndex: ref.endIndex,
      endIndex: ref.endIndex + ref.alias.length,
    });

    aliasMap.set(aliasLower, existing);
  }

  // Report duplicates
  for (const occurrences of aliasMap.values()) {
    if (occurrences.length > 1) {
      // Mark all occurrences after the first as errors
      for (let i = 1; i < occurrences.length; i++) {
        const occurrence = occurrences.at(i);
        if (!occurrence) continue;
        diagnostics.push(
          createDiagnostic(
            `Duplicate table alias "${occurrence.alias}" — each table must have a unique alias. ${MC.SHORT} requires distinct aliases in JOINs.`,
            "error",
            occurrence.startIndex,
            occurrence.endIndex,
          ),
        );
      }
    }
  }

  return diagnostics;
};

/**
 * Rule to detect duplicate table aliases.
 * MCE SQL requires each table in a query to have a unique alias.
 */
export const duplicateTableAliasRule: LintRule = {
  id: "duplicate-table-alias",
  name: "Duplicate Table Alias",
  check: (context: LintContext) => {
    return getDuplicateTableAliasDiagnostics(context.sql);
  },
};
