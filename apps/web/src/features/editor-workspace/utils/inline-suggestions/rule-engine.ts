import type { InlineSuggestionContext, InlineSuggestion } from "./types";
import { joinKeywordRule } from "./rules/join-keyword-rule";
import { aliasSuggestionRule } from "./rules/alias-suggestion-rule";
import { onKeywordRule } from "./rules/on-keyword-rule";
import {
  isInsideString,
  isInsideComment,
  isInsideBrackets,
  isAfterComparisonOperator,
  isInsideFunctionParens,
} from "../sql-context";

/**
 * All rules in priority order (highest priority first).
 * First matching rule wins.
 */
const RULES = [
  joinKeywordRule, // Priority 100: INNER → " JOIN"
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
  if (isInsideString(ctx.sql, ctx.cursorIndex)) return null;
  if (isInsideComment(ctx.sql, ctx.cursorIndex)) return null;
  if (isInsideBrackets(ctx.sql, ctx.cursorIndex)) return null;
  if (isAfterComparisonOperator(ctx.sql, ctx.cursorIndex)) return null;
  if (isInsideFunctionParens(ctx.sql, ctx.cursorIndex)) return null;

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
