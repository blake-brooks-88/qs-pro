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
 */
export const joinKeywordRule: InlineSuggestionRule = {
  id: "join-keyword",

  matches(ctx) {
    // Get the last word before cursor
    const textBefore = ctx.sql.slice(0, ctx.cursorIndex);
    const match = /\b(\w+)$/.exec(textBefore);
    if (!match) return false;

    const lastWord = match[1].toLowerCase();
    return JOIN_MODIFIERS.has(lastWord);
  },

  async getSuggestion() {
    return {
      text: " JOIN",
      priority: 100,
    };
  },
};
