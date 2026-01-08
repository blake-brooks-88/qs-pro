import type { InlineSuggestionContext, InlineSuggestion } from "./types";
import { joinKeywordRule } from "./rules/join-keyword-rule";
import { aliasSuggestionRule } from "./rules/alias-suggestion-rule";
import { onKeywordRule } from "./rules/on-keyword-rule";
import { joinConditionRule } from "./rules/join-condition-rule";

/**
 * All rules in priority order (highest priority first).
 * First matching rule wins.
 */
const RULES = [
  joinKeywordRule,      // Priority 100: INNER → " JOIN"
  aliasSuggestionRule,  // Priority 80: table → " AS alias"
  onKeywordRule,        // Priority 70: alias → " ON "
  joinConditionRule,    // Priority 60: ON → "a.id = b.id"
];

/**
 * Evaluates all inline suggestion rules and returns the first matching suggestion.
 * Rules are evaluated in priority order.
 */
export async function evaluateInlineSuggestions(
  ctx: InlineSuggestionContext
): Promise<InlineSuggestion | null> {
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
