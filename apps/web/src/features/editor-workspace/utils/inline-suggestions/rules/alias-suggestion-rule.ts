import type { InlineSuggestionRule } from "../types";
import { generateSmartAlias } from "../../alias-generator";

/**
 * Rule: After completing a table name in FROM or JOIN clause, suggest " AS {alias}"
 */
export const aliasSuggestionRule: InlineSuggestionRule = {
  id: "alias-suggestion",

  matches(ctx) {
    const { sqlContext, sql, cursorIndex } = ctx;

    // Must be after FROM or JOIN keyword
    if (
      sqlContext.lastKeyword !== "join" &&
      sqlContext.lastKeyword !== "from"
    ) {
      return false;
    }

    // Must have a table after FROM/JOIN
    if (!sqlContext.hasFromJoinTable) {
      return false;
    }

    // Must not be typing a word (cursor after space)
    if (sqlContext.currentWord) {
      return false;
    }

    // Check if ON keyword already follows (for JOIN context)
    const textAfter = sql.slice(cursorIndex, cursorIndex + 10);
    if (/^\s*on\b/i.test(textAfter)) {
      return false;
    }

    // Check if WHERE/GROUP/ORDER already follows (for FROM context)
    if (/^\s*(where|group|order|having)\b/i.test(textAfter)) {
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

    // Strip ENT. prefix for alias generation to use the actual table name
    const tableName = lastTable.name;
    if (!tableName) return null;
    const nameForAlias = tableName.replace(/^ENT\./i, "");
    const alias = generateSmartAlias(nameForAlias, ctx.existingAliases);

    return {
      text: ` AS ${alias}`,
      priority: 80,
    };
  },
};
