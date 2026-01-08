import type { InlineSuggestionRule } from "../types";

/**
 * Normalizes a field name for comparison (lowercase, remove non-alphanumeric).
 */
const normalizeField = (name: string): string =>
  name.replace(/[^a-z0-9]/gi, "").toLowerCase();

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

    // Build a map of normalized field names to actual names for right table
    const rightFieldMap = new Map(
      rightFields.map((f) => [normalizeField(f.name), f.name])
    );

    // Find matching fields
    const matches: Array<{ left: string; right: string; exact: boolean }> = [];

    for (const leftField of leftFields) {
      const normalized = normalizeField(leftField.name);
      const rightMatch = rightFieldMap.get(normalized);
      if (rightMatch) {
        matches.push({
          left: leftField.name,
          right: rightMatch,
          exact: leftField.name === rightMatch,
        });
      }
    }

    if (matches.length === 0) return null;

    // Prioritize exact matches
    matches.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0));

    const bestMatch = matches[0];
    const leftAlias = leftTable.alias ?? leftTable.qualifiedName;
    const rightAlias = rightTable.alias ?? rightTable.qualifiedName;

    return {
      text: `${leftAlias}.${bestMatch.left} = ${rightAlias}.${bestMatch.right}`,
      priority: 60,
      alternatives: matches.slice(1, 4).map(
        (m) => `${leftAlias}.${m.left} = ${rightAlias}.${m.right}`
      ),
    };
  },
};
