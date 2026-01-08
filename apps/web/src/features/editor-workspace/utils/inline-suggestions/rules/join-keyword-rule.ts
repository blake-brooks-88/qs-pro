import type { InlineSuggestionRule } from "../types";

const JOIN_MODIFIERS = new Set([
  "inner",
  "left",
  "right",
  "full",
  "outer",
  "cross",
]);

/**
 * Rule: After typing INNER, LEFT, RIGHT, etc., suggest " JOIN"
 *
 * Special handling for LEFT/RIGHT in SELECT clause:
 * These could be function calls (LEFT(str, n), RIGHT(str, n)),
 * so we only suggest JOIN when in a clause context (after FROM/JOIN).
 */
export const joinKeywordRule: InlineSuggestionRule = {
  id: "join-keyword",

  matches(ctx) {
    // Get the last word before cursor
    const textBefore = ctx.sql.slice(0, ctx.cursorIndex);
    const match = /\b(\w+)$/.exec(textBefore);
    if (!match) return false;

    const lastWord = match[1].toLowerCase();
    if (!JOIN_MODIFIERS.has(lastWord)) return false;

    // Special case: LEFT and RIGHT could be functions in SELECT clause
    // Only suggest JOIN if we're in a clause context (after FROM or JOIN)
    if (lastWord === "left" || lastWord === "right") {
      // Check if we have FROM or JOIN before this word
      const beforeLastWord = textBefore.slice(0, match.index);
      const hasFromOrJoin = /\b(from|join)\b/i.test(beforeLastWord);

      // If we have FROM/JOIN before, we're likely in a clause context
      // If not, we could be in SELECT clause with a function call
      return hasFromOrJoin;
    }

    // For other modifiers (INNER, FULL, OUTER, CROSS), always suggest
    return true;
  },

  async getSuggestion() {
    return {
      text: " JOIN",
      priority: 100,
    };
  },
};
