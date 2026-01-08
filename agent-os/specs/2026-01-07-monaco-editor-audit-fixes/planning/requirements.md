# Spec Requirements: Monaco Editor Audit Fixes

## Initial Description

Monaco Editor Red Team Audit Report - SFMC SQL IDE Implementation Review

This spec addresses findings from a comprehensive security and UX audit of the Monaco Editor implementation. The audit identified 11 issues across 3 categories (Critical UX Failures, SFMC Compliance Gaps, Logic & Code Interaction Bugs), plus additional scope for a new linting rule and linter modularization.

## Requirements Discussion

### First Round Questions

**Q1:** Priority & Scope: The audit identifies 11 issues across 3 categories. I assume you want to address all issues in this spec rather than splitting into multiple specs. Is that correct, or would you prefer to tackle them in phases?

**Answer:** Yes, address all issues in a single spec. The issues are interconnected - fixing autocomplete properly requires understanding the linting flow, and the performance fixes affect both systems.

**Q2:** Autocomplete Behavior: The audit proposes keywords should appear in ALL contexts as a fallback. I assume this is the desired behavior. Is that correct, or should keywords only appear after the user starts typing?

**Answer:** Yes, keywords should always be available as fallback suggestions. The current behavior where keywords disappear based on cursor position is the bug. Show them always, but use sortText to prioritize contextually relevant ones (e.g., after WHERE, prioritize AND, OR, IN over SELECT). Though autocomplete suggestions should only show when the user is typing.

**Q3:** CTE Handling: The audit recommends changing CTE detection from a warning to an error. However, your product mission (FR-2.3) says "Warn user" for CTEs. Should we upgrade to error or keep as warning?

**Answer:** We should block the run. It should be an error.

**Q4:** `prereq` Diagnostic Visibility: The audit notes that `prereq` severity doesn't show squiggles. Should these be shown as info-level markers or kept hidden?

**Answer:** Keep hidden (current behavior). The prereq severity is intentionally "soft" - it's for incomplete SQL while the user is still typing. Showing squiggles on `SELECT |` before they've typed fields would be noisy. The run-blocking behavior is sufficient feedback.

**Q5:** Performance Threshold: The audit recommends 150ms debounce for decoration updates. Your NFRs mention "debounce < 300ms". Should we use 150ms or 300ms?

**Answer:** Use 150ms. The 300ms in NFRs was a ceiling, not a target. 150ms feels more responsive for decoration updates specifically. Linting can stay synchronous since it's fast.

**Q6:** Unsupported Functions: The audit suggests flagging SFMC-unsupported functions. Should these be warnings or errors?

**Answer:** Yes, warnings (not errors). These functions fail at SFMC runtime, but the linter can't know every edge case. Yellow squiggle with message like "This function may not be supported in Marketing Cloud SQL" is appropriate. Also include ORDER BY in supported SQL context (OFFSET/FETCH warnings).

**Q7:** SELECT * in JOINs: Should this be a warning, info hint, or skipped?

**Answer:** Skip for this spec. It's a best-practice suggestion, not a guardrail. Focus on the actual bugs and compliance gaps first. We can add "hints" as a future enhancement.

### Existing Code to Reference

**Similar Features Identified:**
- Feature: Debouncing - Path: `apps/web/src/hooks/` (check for useDebouncedValue or similar; if not present, use audit's standard pattern)
- Feature: SQL Linting - Path: `apps/web/src/features/editor-workspace/utils/sql-lint.ts`
- Feature: SQL Context - Path: `apps/web/src/features/editor-workspace/utils/sql-context.ts`
- Feature: SQL Autocomplete - Path: `apps/web/src/features/editor-workspace/utils/sql-autocomplete.ts`
- Feature: Monaco Editor - Path: `apps/web/src/features/editor-workspace/components/MonacoQueryEditor.tsx`
- Test Patterns: `sql-lint.test.ts`, `sql-autocomplete.test.ts` (follow Arrange-Act-Assert)

### Follow-up Questions

No follow-up questions were needed - the user provided comprehensive answers with additional scope.

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
N/A

## Additional Scope (User-Provided)

### New Linting Rule: Aggregate Functions Without GROUP BY

**Rule ID:** `aggregate-without-group-by`

**Severity:** Warning

**Description:** Detects SELECT statements that mix aggregate functions (COUNT, SUM, AVG, MIN, MAX) with non-aggregated columns without a corresponding GROUP BY clause.

**Valid Examples:**
```sql
-- Scalar aggregate (no GROUP BY needed)
SELECT COUNT(*) FROM [Subscribers]

-- All columns aggregated
SELECT COUNT(SubscriberKey), MAX(DateAdded) FROM [Subscribers]

-- Proper GROUP BY
SELECT Region, COUNT(SubscriberKey) FROM [Subscribers] GROUP BY Region

-- Aggregate with literal (literal doesn't need grouping)
SELECT 'Total' AS Label, COUNT(*) FROM [Subscribers]
```

**Invalid Examples (should warn):**
```sql
-- Non-aggregated column without GROUP BY
SELECT SubscriberKey, COUNT(EmailAddress) FROM [Subscribers]

-- Mixed aggregated and non-aggregated
SELECT Region, City, SUM(Revenue) FROM [Sales]
```

**Message:** `Column "{fieldName}" must appear in GROUP BY clause or be used in an aggregate function.`

**Detection Logic:**
1. Identify if SELECT clause contains any aggregate function calls
2. If yes, check for presence of GROUP BY clause
3. If no GROUP BY, verify ALL non-literal SELECT expressions are wrapped in aggregate functions
4. If mixed, flag each non-aggregated column reference

**Edge Cases to Handle:**
- Expressions inside aggregates: `COUNT(DISTINCT Region)` - Region is aggregated
- Nested functions: `UPPER(Region)` without GROUP BY - should warn
- Subqueries in SELECT: `(SELECT MAX(x) FROM ...)` - don't flag outer columns for inner aggregates
- `*` wildcard with aggregate: `SELECT *, COUNT(x)` - should warn

### Linter Modularization

**Current State:** `sql-lint.ts` is 553 lines with 6+ distinct rule categories - scaling concern.

**Proposed Structure:**
```
utils/
├── sql-lint.ts                    # Main entry point (re-export for backwards compat)
├── sql-lint/
│   ├── index.ts                   # Re-exports lintSql
│   ├── types.ts                   # LintRule interface, LintContext
│   ├── rules/
│   │   ├── prohibited-keywords.ts # DML/DDL/procedural detection
│   │   ├── cte-detection.ts       # WITH...AS error (upgraded from warning)
│   │   ├── select-clause.ts       # Empty SELECT, literal aliases
│   │   ├── unbracketed-names.ts   # Space in DE names
│   │   ├── ambiguous-fields.ts    # Unqualified fields in JOINs
│   │   ├── aggregate-grouping.ts  # NEW: Aggregate without GROUP BY
│   │   └── unsupported-functions.ts # NEW: SFMC-unsupported functions
│   └── utils/
│       ├── tokenizer.ts           # Shared tokenization (move from sql-context)
│       └── expression-parser.ts   # Shared expression splitting logic
```

**Rule Interface:**
```typescript
// sql-lint/types.ts
export interface LintContext {
  sql: string;
  tokens: SqlToken[];
  dataExtensions?: DataExtension[];
}

export interface LintRule {
  id: string;
  name: string;
  check: (context: LintContext) => SqlDiagnostic[];
}
```

**Main Entry Point:**
```typescript
// sql-lint/index.ts
import { prohibitedKeywordsRule } from './rules/prohibited-keywords';
import { cteDetectionRule } from './rules/cte-detection';
// ... other imports

const rules: LintRule[] = [
  prohibitedKeywordsRule,
  cteDetectionRule,
  selectClauseRule,
  unbracketedNamesRule,
  ambiguousFieldsRule,
  aggregateGroupingRule,
  unsupportedFunctionsRule,
];

export const lintSql = (sql: string, options: LintOptions = {}): SqlDiagnostic[] => {
  const tokens = tokenizeSql(sql);
  const context: LintContext = {
    sql,
    tokens,
    dataExtensions: options.dataExtensions,
  };

  return rules.flatMap((rule) => rule.check(context));
};
```

**Benefits:**
1. Testability: Each rule can be unit tested in isolation
2. Maintainability: Adding new rules doesn't bloat a single file
3. Discoverability: Rule files serve as documentation
4. Performance: Future option to run rules in parallel or skip expensive rules
5. Configurability: Easy to add rule enable/disable or severity overrides later

**Migration Path:**
1. Create `sql-lint/` directory structure
2. Extract `types.ts` and `LintRule` interface
3. Move each `get*Diagnostics` function to its own rule file
4. Update imports in `sql-lint.ts` to use new structure
5. Keep `sql-lint.ts` as a re-export for backwards compatibility
6. Add new rules (`aggregate-grouping`, `unsupported-functions`) in new structure

## Requirements Summary

### Functional Requirements

#### Critical UX Fixes (Priority 1)
1. **Autocomplete Keyword Consistency** - Fix fallthrough logic in `provideCompletionItems` so keywords are always available as fallback suggestions. Use `sortText` to prioritize contextually relevant keywords (e.g., AND, OR, IN after WHERE). Suggestions should only appear when user is actively typing.
2. **Add Missing triggerCharacters** - Add `,`, `)`, `\n`, `\t` to completion provider triggers
3. **Fix Async Race Condition** - Implement debouncing/cancellation for field fetching to prevent flicker during fast typing

#### SFMC Compliance Fixes (Priority 2)
4. **Complete Prohibited Keywords** - Add missing prohibited keywords:
   - DML: (existing: update, delete, insert, merge)
   - DDL: drop, alter, truncate, create
   - Execution: exec, execute
   - Permissions: grant, revoke
   - Transactions: begin, commit, rollback, savepoint
   - Cursors: cursor, fetch, open, close, deallocate
   - Other: backup, restore, kill
   - Procedural: declare, set, while, print, go, if, else, return, throw, try, catch, waitfor, raiserror

5. **CTE Detection → Error** - Upgrade CTE detection from warning to error (blocks RUN button). Improve detection to catch:
   - `WITH cte_name (columns) AS ...`
   - Multi-CTE: `WITH cte1 AS (...), cte2 AS (...)`

6. **Unsupported Functions Warning** - Add warnings for SFMC-unsupported functions:
   - String: `string_agg`, `string_split`
   - JSON: `json_value`, `json_query`, `json_modify`, `openjson`, `isjson`
   - Conversion: `try_convert`, `try_cast`, `try_parse`
   - Pagination: `offset`, `fetch` (when used for pagination, not cursor)

#### Logic & Performance Fixes (Priority 3)
7. **Fix Stale Closure References** - Add `getJoinSuggestions` to dependency array for inline completion provider
8. **Debounce Decoration Updates** - Implement 150ms debounce for decoration updates (table references, field ranges) to prevent lag on large files
9. **Keep prereq Hidden** - Maintain current behavior (no squiggles for prereq severity)

#### New Features (Priority 4)
10. **Aggregate Without GROUP BY Rule** - New linting rule to detect mixed aggregate/non-aggregate columns without GROUP BY clause
11. **Linter Modularization** - Refactor `sql-lint.ts` into modular rule structure

### Reusability Opportunities
- Check `apps/web/src/hooks/` for existing debounce utilities
- Follow test patterns in `sql-lint.test.ts`, `sql-autocomplete.test.ts` (Arrange-Act-Assert)
- Reference existing `sql-context.ts` tokenization for new rule implementation

### Scope Boundaries

**In Scope:**
- All 11 audit findings
- New aggregate/GROUP BY linting rule
- Linter modularization refactor
- Unit tests for all changes (following existing patterns)

**Out of Scope:**
- SELECT * in JOINs warning (future enhancement)
- "Hints" system for best practices
- Any changes to `prereq` diagnostic visibility
- Rule enable/disable configuration (future enhancement)

### Technical Considerations
- Debounce threshold: 150ms for decorations
- Linting remains synchronous (fast enough)
- Backwards compatibility: Keep `sql-lint.ts` as re-export
- Monaco completion provider: Only show suggestions when user is typing
- CTE detection: Now blocks RUN (error severity)
- Test coverage required for all new/modified rules
