import type { DataExtension } from "@/features/editor-workspace/types";
import { tokenizeSql } from "./utils/tokenizer";
// Original rules
import { prohibitedKeywordsRule } from "./rules/prohibited-keywords";
import { cteDetectionRule } from "./rules/cte-detection";
import { selectClauseRule } from "./rules/select-clause";
import { unbracketedNamesRule } from "./rules/unbracketed-names";
import { ambiguousFieldsRule } from "./rules/ambiguous-fields";
import { limitProhibitionRule } from "./rules/limit-prohibition";
import { offsetWithoutOrderByRule } from "./rules/offset-without-order-by";
import { unsupportedFunctionsRule } from "./rules/unsupported-functions";
import { aggregateGroupingRule } from "./rules/aggregate-grouping";
import { commaValidationRule } from "./rules/comma-validation";
import { aliasInClauseRule } from "./rules/alias-in-clause";
// New syntax error rules
import { trailingSemicolonRule } from "./rules/trailing-semicolon";
import { unmatchedDelimitersRule } from "./rules/unmatched-delimiters";
import { emptyInClauseRule } from "./rules/empty-in-clause";
import { variableUsageRule } from "./rules/variable-usage";
// New identifier error rules
import { duplicateTableAliasRule } from "./rules/duplicate-table-alias";
import { duplicateColumnAliasRule } from "./rules/duplicate-column-alias";
import { selectStarWithJoinRule } from "./rules/select-star-with-join";
import { selfJoinSameAliasRule } from "./rules/self-join-same-alias";
// New advanced error rules
import { orderByInSubqueryRule } from "./rules/order-by-in-subquery";
import { missingJoinOnRule } from "./rules/missing-join-on";
import { aggregateInWhereRule } from "./rules/aggregate-in-where";
import { subqueryWithoutAliasRule } from "./rules/subquery-without-alias";
// Warning rules
import { selectStarSingleRule } from "./rules/select-star-single";
import { withNolockRule } from "./rules/with-nolock";
import { notInSubqueryRule } from "./rules/not-in-subquery";
import { notEqualStyleRule } from "./rules/not-equal-style";

export type {
  SqlDiagnostic,
  SqlDiagnosticSeverity,
  LintRule,
  LintContext,
} from "./types";

export {
  BLOCKING_SEVERITIES,
  isBlockingDiagnostic,
  getFirstBlockingDiagnostic,
  hasBlockingDiagnostics,
} from "./types";

interface LintOptions {
  dataExtensions?: DataExtension[];
  cursorPosition?: number;
}

/**
 * All registered lint rules.
 */
const rules = [
  // Original rules
  prohibitedKeywordsRule,
  cteDetectionRule,
  selectClauseRule,
  unbracketedNamesRule,
  ambiguousFieldsRule,
  limitProhibitionRule,
  offsetWithoutOrderByRule,
  unsupportedFunctionsRule,
  aggregateGroupingRule,
  commaValidationRule,
  aliasInClauseRule,
  // New syntax error rules
  trailingSemicolonRule,
  unmatchedDelimitersRule,
  emptyInClauseRule,
  variableUsageRule,
  // New identifier error rules
  duplicateTableAliasRule,
  duplicateColumnAliasRule,
  selectStarWithJoinRule,
  selfJoinSameAliasRule,
  // New advanced error rules
  orderByInSubqueryRule,
  missingJoinOnRule,
  aggregateInWhereRule,
  subqueryWithoutAliasRule,
  // Warning rules
  selectStarSingleRule,
  withNolockRule,
  notInSubqueryRule,
  notEqualStyleRule,
];

/**
 * Evaluates SQL for guardrails and structural validity.
 * Runs all registered lint rules and aggregates diagnostics.
 */
export const lintSql = (sql: string, options: LintOptions = {}) => {
  const tokens = tokenizeSql(sql);
  const context = {
    sql,
    tokens,
    dataExtensions: options.dataExtensions,
    cursorPosition: options.cursorPosition,
  };

  const diagnostics = rules.flatMap((rule) => rule.check(context));
  return diagnostics;
};
