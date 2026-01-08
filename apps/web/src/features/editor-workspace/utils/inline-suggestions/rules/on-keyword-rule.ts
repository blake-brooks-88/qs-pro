import type { InlineSuggestionRule } from "../types";

/**
 * Rule: After adding an alias to a JOIN table, suggest " ON "
 */
export const onKeywordRule: InlineSuggestionRule = {
  id: "on-keyword",

  matches(ctx) {
    const { sqlContext, sql, cursorIndex } = ctx;

    // Must be after JOIN keyword
    if (sqlContext.lastKeyword !== "join") {
      return false;
    }

    // Must not be typing a word
    if (sqlContext.currentWord) {
      return false;
    }

    // Must have at least 2 tables (FROM + JOIN)
    if (ctx.tablesInScope.length < 2) {
      return false;
    }

    // The last table (JOIN table) must have an alias
    const lastTable = ctx.tablesInScope[ctx.tablesInScope.length - 1];
    if (!lastTable?.alias) {
      return false;
    }

    // ON must not already be present
    const textBefore = sql.slice(0, cursorIndex);
    // Check if we're past the table definition (after alias)
    // Pattern: JOIN [Table] alias<cursor>
    if (/\bON\b/i.test(textBefore.slice(textBefore.lastIndexOf("JOIN")))) {
      return false;
    }

    return true;
  },

  async getSuggestion() {
    return {
      text: " ON ",
      priority: 70,
    };
  },
};
