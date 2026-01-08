/**
 * Returns contextually relevant SQL keywords based on the last keyword in the query.
 * These keywords should be prioritized in autocomplete suggestions using sortText.
 *
 * @param lastKeyword - The last SQL keyword before the cursor (lowercase)
 * @returns Array of high-priority keywords for the given context
 */
export const getContextualKeywords = (lastKeyword: string | null): string[] => {
  if (!lastKeyword) return [];

  const normalized = lastKeyword.toLowerCase();

  switch (normalized) {
    case "where":
      return ["AND", "OR", "IN", "NOT", "LIKE", "BETWEEN"];
    case "select":
      return ["FROM", "DISTINCT", "TOP", "CASE", "AS"];
    case "from":
      return ["WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "ON"];
    case "join":
    case "inner":
    case "left":
    case "right":
    case "full":
    case "cross":
      return ["ON", "WHERE"];
    default:
      return [];
  }
};
