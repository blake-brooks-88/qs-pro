import {
  isAfterComparisonOperator,
  isAtEndOfBracketedTableInFromJoin,
  isInsideBrackets,
  isInsideComment,
  isInsideFunctionParens,
  isInsideString,
} from "../sql-context";
import { aliasSuggestionRule } from "./rules/alias-suggestion-rule";
import { joinKeywordRule } from "./rules/join-keyword-rule";
import { onKeywordRule } from "./rules/on-keyword-rule";
import { relationshipJoinRule } from "./rules/relationship-join-rule";
import type { InlineSuggestion, InlineSuggestionContext } from "./types";

/**
 * All rules in priority order (highest priority first).
 * First matching rule wins.
 */
const RULES = [
  joinKeywordRule, // Priority 100: INNER → " JOIN"
  relationshipJoinRule, // Priority 90: JOIN → "Table alias ON ..." (from relationship graph)
  aliasSuggestionRule, // Priority 80: table → " AS alias"
  onKeywordRule, // Priority 70: alias → " ON "
];

/**
 * Evaluates all inline suggestion rules and returns the first matching suggestion.
 * Rules are evaluated in priority order.
 *
 * Negative conditions are checked first - suggestions are suppressed in:
 * - String literals (single or double quoted)
 * - Comments (line or block)
 * - Bracket expressions [...]
 * - After comparison operators (=, !=, <, >, etc.)
 * - Inside function parentheses
 */
export async function evaluateInlineSuggestions(
  ctx: InlineSuggestionContext,
): Promise<InlineSuggestion | null> {
  // Negative conditions - return early if any match
  if (isInsideString(ctx.sql, ctx.cursorIndex)) {
    return null;
  }
  if (isInsideComment(ctx.sql, ctx.cursorIndex)) {
    return null;
  }
  // Allow alias suggestions when cursor is inside a bracketed table in FROM/JOIN
  // (e.g. `FROM [Orders|]` with Monaco auto-closed `]`).
  const insideBrackets = isInsideBrackets(ctx.sql, ctx.cursorIndex);
  if (
    insideBrackets &&
    !isAtEndOfBracketedTableInFromJoin(ctx.sql, ctx.cursorIndex)
  ) {
    return null;
  }
  if (isAfterComparisonOperator(ctx.sql, ctx.cursorIndex)) {
    return null;
  }
  if (isInsideFunctionParens(ctx.sql, ctx.cursorIndex)) {
    return null;
  }

  // Evaluate rules in priority order
  for (const rule of RULES) {
    if (rule.matches(ctx)) {
      const suggestion = await rule.getSuggestion(ctx);
      if (suggestion) {
        return suggestion;
      }
    }
  }
  return null;
}
