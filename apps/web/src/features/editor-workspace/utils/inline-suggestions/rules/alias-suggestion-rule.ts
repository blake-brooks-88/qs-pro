import type { InlineSuggestionRule } from "../types";
import { generateSmartAlias } from "../../alias-generator";

/**
 * Rule: After completing a table name in JOIN clause, suggest " AS {alias}"
 */
export const aliasSuggestionRule: InlineSuggestionRule = {
  id: "alias-suggestion",

  matches(ctx) {
    const { sqlContext, sql, cursorIndex } = ctx;

    // Must be after JOIN keyword (not FROM)
    if (sqlContext.lastKeyword !== "join") {
      return false;
    }

    // Must have a table after JOIN
    if (!sqlContext.hasFromJoinTable) {
      return false;
    }

    // Must not be typing a word (cursor after space)
    if (sqlContext.currentWord) {
      return false;
    }

    // Check if ON keyword already follows
    const textAfter = sql.slice(cursorIndex, cursorIndex + 10);
    if (/^\s*on\b/i.test(textAfter)) {
      return false;
    }

    // Check if the last table already has an alias
    const lastTable = ctx.tablesInScope[ctx.tablesInScope.length - 1];
    if (lastTable?.alias) {
      return false;
    }

    return true;
  },

  async getSuggestion(ctx) {
    const lastTable = ctx.tablesInScope[ctx.tablesInScope.length - 1];
    if (!lastTable) return null;

    const alias = generateSmartAlias(lastTable.name, ctx.existingAliases);

    return {
      text: ` AS ${alias}`,
      priority: 80,
    };
  },
};
