import type { InlineSuggestionRule } from "../types";
import { generateSmartAlias } from "../../alias-generator";

/**
 * Rule: After completing a table name in FROM or JOIN clause, suggest " AS {alias}"
 */
export const aliasSuggestionRule: InlineSuggestionRule = {
  id: "alias-suggestion",

  matches(ctx) {
    const { sqlContext, sql, cursorIndex } = ctx;

    if (
      sqlContext.lastKeyword !== "join" &&
      sqlContext.lastKeyword !== "from"
    ) {
      return false;
    }

    if (!sqlContext.hasFromJoinTable) {
      return false;
    }

    const lastTable = ctx.tablesInScope[ctx.tablesInScope.length - 1];
    if (!lastTable || lastTable.alias) {
      return false;
    }

    // Allow suggestion if cursor is after a completed table name
    // Either no word at cursor (after space/bracket) or word matches the table name
    const currentWord = sqlContext.currentWord.toLowerCase();
    if (currentWord && currentWord !== lastTable.name.toLowerCase()) {
      return false;
    }

    const textAfter = sql.slice(cursorIndex, cursorIndex + 10);
    if (/^\s*on\b/i.test(textAfter)) {
      return false;
    }

    if (/^\s*(where|group|order|having)\b/i.test(textAfter)) {
      return false;
    }

    return true;
  },

  async getSuggestion(ctx) {
    const lastTable = ctx.tablesInScope[ctx.tablesInScope.length - 1];
    if (!lastTable) return null;

    const tableName = lastTable.name;
    if (!tableName) return null;
    const nameForAlias = tableName.replace(/^ENT\./i, "");
    const alias = generateSmartAlias(nameForAlias, ctx.existingAliases);

    if (!alias) return null;

    return {
      text: ` AS ${alias}`,
      priority: 80,
    };
  },
};
