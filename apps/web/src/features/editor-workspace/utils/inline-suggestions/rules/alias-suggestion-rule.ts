import type { InlineSuggestionRule } from "../types";
import { generateSmartAlias } from "../../alias-generator";
import { isAtEndOfBracketedTableInFromJoin } from "../../sql-context";

/**
 * Rule: After completing a table name in FROM or JOIN clause, suggest " AS {alias}"
 */
export const aliasSuggestionRule: InlineSuggestionRule = {
  id: "alias-suggestion",

  matches(ctx) {
    const { sqlContext, sql, cursorIndex } = ctx;

    const isInsideBracket = isAtEndOfBracketedTableInFromJoin(sql, cursorIndex);

    if (isInsideBracket) {
      return true;
    }

    if (
      sqlContext.lastKeyword !== "join" &&
      sqlContext.lastKeyword !== "from"
    ) {
      return false;
    }

    if (!sqlContext.hasFromJoinTable) {
      return false;
    }

    const lastTable = ctx.tablesInScope.at(-1);
    if (!lastTable || lastTable.alias) {
      return false;
    }

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
    const { sql, cursorIndex } = ctx;
    const isInsideBracket = isAtEndOfBracketedTableInFromJoin(sql, cursorIndex);

    let tableName: string;

    if (isInsideBracket) {
      let openBracketIndex = -1;
      for (let i = cursorIndex - 1; i >= 0; i--) {
        if (sql.charAt(i) === "[") {
          openBracketIndex = i;
          break;
        }
        if (sql.charAt(i) === "]") {
          break;
        }
      }
      if (openBracketIndex === -1) return null;
      tableName = sql.slice(openBracketIndex + 1, cursorIndex).trim();
    } else {
      const lastTable = ctx.tablesInScope.at(-1);
      if (!lastTable) return null;
      tableName = lastTable.name;
    }

    if (!tableName) return null;
    const nameForAlias = tableName.replace(/^ENT\./i, "");
    const alias = generateSmartAlias(nameForAlias, ctx.existingAliases);

    if (!alias) return null;

    const suggestionText = isInsideBracket ? `] AS ${alias}` : ` AS ${alias}`;

    return {
      text: suggestionText,
      priority: 80,
    };
  },
};
