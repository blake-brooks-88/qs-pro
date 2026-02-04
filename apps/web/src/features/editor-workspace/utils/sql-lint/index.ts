import type { DataExtension } from "@/features/editor-workspace/types";

import { aggregateGroupingRule } from "./rules/aggregate-grouping";
import { aggregateInWhereRule } from "./rules/aggregate-in-where";
import { aliasInClauseRule } from "./rules/alias-in-clause";
import { ambiguousFieldsRule } from "./rules/ambiguous-fields";
import { commaValidationRule } from "./rules/comma-validation";
import { cteDetectionRule } from "./rules/cte-detection";
import { duplicateColumnAliasRule } from "./rules/duplicate-column-alias";
// New identifier error rules
import { duplicateTableAliasRule } from "./rules/duplicate-table-alias";
import { emptyInClauseRule } from "./rules/empty-in-clause";
import { limitProhibitionRule } from "./rules/limit-prohibition";
import { missingJoinOnRule } from "./rules/missing-join-on";
import { noMultiStatementRule } from "./rules/no-multi-statement";
import { notEqualStyleRule } from "./rules/not-equal-style";
import { notInSubqueryRule } from "./rules/not-in-subquery";
import { offsetWithoutOrderByRule } from "./rules/offset-without-order-by";
// New advanced error rules
import { orderByInSubqueryRule } from "./rules/order-by-in-subquery";
// Original rules
import { prohibitedKeywordsRule } from "./rules/prohibited-keywords";
import { selectClauseRule } from "./rules/select-clause";
// Warning rules
import { selectStarSingleRule } from "./rules/select-star-single";
import { selectStarWithJoinRule } from "./rules/select-star-with-join";
import { selfJoinSameAliasRule } from "./rules/self-join-same-alias";
import { subqueryWithoutAliasRule } from "./rules/subquery-without-alias";
// New syntax error rules
import { trailingSemicolonRule } from "./rules/trailing-semicolon";
import { unbracketedNamesRule } from "./rules/unbracketed-names";
import { unmatchedDelimitersRule } from "./rules/unmatched-delimiters";
import { unsupportedFunctionsRule } from "./rules/unsupported-functions";
import { variableUsageRule } from "./rules/variable-usage";
import { withNolockRule } from "./rules/with-nolock";
import { tokenizeSql } from "./utils/tokenizer";

export type {
  LintContext,
  LintRule,
  SqlDiagnostic,
  SqlDiagnosticSeverity,
} from "./types";
export {
  BLOCKING_SEVERITIES,
  getFirstBlockingDiagnostic,
  hasBlockingDiagnostics,
  isBlockingDiagnostic,
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
  noMultiStatementRule,
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
