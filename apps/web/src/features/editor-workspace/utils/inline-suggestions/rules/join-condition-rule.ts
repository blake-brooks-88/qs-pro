import type { InlineSuggestionRule } from "../types";
import { IDENTITY_FIELD_PATTERNS } from "@/features/editor-workspace/constants";
import type { DataExtensionField } from "@/features/editor-workspace/types";

/**
 * Normalizes a field name for comparison (lowercase, remove non-alphanumeric).
 */
const normalizeField = (name: string): string =>
  name.replace(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Checks if a field name is an SFMC identity field.
 */
const isIdentityField = (fieldName: string): boolean =>
  IDENTITY_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));

/**
 * Interface for field match results with priority ranking.
 */
interface FieldMatch {
  left: DataExtensionField;
  right: DataExtensionField;
  priority: number;
}

/**
 * Rule: After ON keyword, suggest field conditions like "a.id = b.id"
 */
export const joinConditionRule: InlineSuggestionRule = {
  id: "join-condition",

  matches(ctx) {
    const { sqlContext } = ctx;

    // Must be after ON keyword
    if (sqlContext.lastKeyword !== "on") {
      return false;
    }

    // Must not be typing a word
    if (sqlContext.currentWord) {
      return false;
    }

    // Must have at least 2 tables
    if (ctx.tablesInScope.length < 2) {
      return false;
    }

    return true;
  },

  async getSuggestion(ctx) {
    const { tablesInScope, getFieldsForTable } = ctx;

    // Get the two most recent tables (left and right of JOIN)
    const rightTable = tablesInScope[tablesInScope.length - 1];
    const leftTable = tablesInScope[tablesInScope.length - 2];

    if (!leftTable || !rightTable) return null;

    // Fetch fields for both tables
    const [leftFields, rightFields] = await Promise.all([
      getFieldsForTable(leftTable),
      getFieldsForTable(rightTable),
    ]);

    // Find matching fields with priority ranking
    const matches: FieldMatch[] = [];

    // 1. Exact name matches (highest priority)
    for (const leftField of leftFields) {
      const exactMatch = rightFields.find(
        (r) => r.name.toLowerCase() === leftField.name.toLowerCase(),
      );
      if (exactMatch) {
        matches.push({
          left: leftField,
          right: exactMatch,
          priority: 1,
        });
      }
    }

    // 2. SFMC identity field equivalences (e.g., ContactID = SubscriberKey)
    const leftIdentityFields = leftFields.filter((f) =>
      isIdentityField(f.name),
    );
    const rightIdentityFields = rightFields.filter((f) =>
      isIdentityField(f.name),
    );

    for (const leftField of leftIdentityFields) {
      for (const rightField of rightIdentityFields) {
        // Skip if already matched exactly
        const alreadyMatched = matches.some(
          (m) =>
            m.left.name === leftField.name && m.right.name === rightField.name,
        );
        if (!alreadyMatched) {
          matches.push({
            left: leftField,
            right: rightField,
            priority: 2,
          });
        }
      }
    }

    // 3. Normalized name matches (ID/Key suffixes)
    const rightFieldMap = new Map(
      rightFields.map((f) => [normalizeField(f.name), f]),
    );

    for (const leftField of leftFields) {
      const normalized = normalizeField(leftField.name);
      const rightMatch = rightFieldMap.get(normalized);

      if (rightMatch) {
        // Skip if already matched
        const alreadyMatched = matches.some(
          (m) =>
            m.left.name === leftField.name && m.right.name === rightMatch.name,
        );
        if (!alreadyMatched) {
          matches.push({
            left: leftField,
            right: rightMatch,
            priority: 3,
          });
        }
      }
    }

    if (matches.length === 0) return null;

    // Sort by priority (lower number = higher priority)
    matches.sort((a, b) => a.priority - b.priority);

    const bestMatch = matches[0];
    const leftAlias = leftTable.alias ?? leftTable.qualifiedName;
    const rightAlias = rightTable.alias ?? rightTable.qualifiedName;

    return {
      text: `${leftAlias}.${bestMatch.left.name} = ${rightAlias}.${bestMatch.right.name}`,
      priority: 60,
      alternatives: matches
        .slice(1, 4)
        .map(
          (m) => `${leftAlias}.${m.left.name} = ${rightAlias}.${m.right.name}`,
        ),
    };
  },
};
