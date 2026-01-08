# Specification: Monaco Editor Audit Fixes

## Goal
Address critical UX and SFMC compliance issues identified in a security/UX audit of the Monaco Editor implementation, add new linting rules (aggregate/GROUP BY, LIMIT prohibition, OFFSET/FETCH prohibition), and modularize the linter for maintainability.

## User Stories
- As an MCE Architect, I want SQL keywords to always appear in autocomplete so that I don't have to memorize keyword availability by cursor position
- As a Campaign Manager, I want to see warnings for SFMC-unsupported SQL functions so that my queries don't fail at runtime

## Specific Requirements

**Autocomplete Keyword Consistency**
- Fix fallthrough logic in `provideCompletionItems` so keywords are always available as fallback
- Use `sortText` to prioritize contextually relevant keywords (e.g., AND, OR, IN after WHERE; DISTINCT, TOP after SELECT)
- Add helper function `getContextualKeywords(lastKeyword)` to determine priority keywords per context
- Add missing `triggerCharacters`: `,`, `)`, `\n`, `\t` to completion provider
- Suggestions should only appear when user is actively typing (not on idle cursor)

**Async Field Fetching Race Condition**
- Implement debouncing or cancellation token for field fetching in autocomplete
- Prevent UI flicker when user types faster than network responses return
- Consider using AbortController pattern for cancellation

**Complete Prohibited Keywords**
- Add to `PROHIBITED_KEYWORDS` set: `create`, `exec`, `execute`, `grant`, `revoke`, `begin`, `commit`, `rollback`, `savepoint`, `cursor`, `fetch`, `open`, `close`, `deallocate`, `backup`, `restore`, `kill`
- Add to `PROCEDURAL_KEYWORDS` set: `if`, `else`, `return`, `throw`, `try`, `catch`, `waitfor`, `raiserror`
- Maintain existing error messages and severity for consistency

**CTE Detection (Error)**
- Keep CTE detection as `error` severity (blocks RUN button)
- Improve regex to catch `WITH cte_name (columns) AS ...` pattern
- Improve regex to catch multi-CTE: `WITH cte1 AS (...), cte2 AS (...)`
- Current simple pattern `/\bAS\s*\(/i` misses column-list syntax
- Message: "CTEs are not supported in Marketing Cloud SQL. Use subqueries instead."

**LIMIT Prohibition (Error)**
- Detect use of `LIMIT` keyword
- SFMC uses T-SQL syntax (`TOP X`), not MySQL/PostgreSQL `LIMIT`
- Use `error` severity with message: "LIMIT is not supported in Marketing Cloud SQL. Use TOP instead."
- Example fix: `SELECT * FROM [Table] LIMIT 10` → `SELECT TOP 10 * FROM [Table]`

**OFFSET/FETCH Prohibition (Error)**
- Detect `OFFSET...FETCH` pagination pattern
- SFMC does not support SQL Server 2012+ pagination syntax
- Use `error` severity with message: "OFFSET/FETCH pagination is not supported in Marketing Cloud SQL. Use TOP for row limiting."
- Detect `OFFSET` keyword followed by `FETCH NEXT` or `FETCH FIRST`

**Unsupported Functions Warning**
- Create new rule to warn on SFMC-unsupported functions
- Functions to flag: `string_agg`, `string_split`, `json_modify`, `openjson`, `isjson`, `try_convert`, `try_cast`, `try_parse`
- Use `warning` severity with message: "This function may not be supported in Marketing Cloud SQL"
- Note: `json_value` and `json_query` ARE supported (SQL Server 2016)

**Fix Stale Closure in Inline Completion Provider**
- Add `getJoinSuggestions` to dependency array in `handleEditorMount` useCallback
- Currently missing from deps array at line 610-618 of `MonacoQueryEditor.tsx`

**Debounce Decoration Updates**
- Implement 150ms debounce for decoration updates (table references, field ranges)
- Create or use existing `useDebouncedValue` hook pattern
- Apply to the `useEffect` at line 645-695 that processes `extractTableReferences` and `extractSelectFieldRanges`

**Aggregate Without GROUP BY Rule (Error)**
- Detect SELECT statements mixing aggregate functions (COUNT, SUM, AVG, MIN, MAX) with non-aggregated columns
- Check for presence of GROUP BY clause when aggregates detected
- Use `error` severity (blocks RUN button) - SFMC will reject these queries at runtime
- Flag each non-aggregated column with message: `Column "{fieldName}" must appear in GROUP BY clause or be used in an aggregate function`
- Handle edge cases: `COUNT(DISTINCT x)` is aggregated, `UPPER(x)` is not, subquery aggregates don't affect outer scope, `SELECT *, COUNT(x)` should warn

**Linter Modularization**
- Create `sql-lint/` directory with `index.ts`, `types.ts`, and `rules/` subdirectory
- Define `LintRule` interface: `{ id: string; name: string; check: (context: LintContext) => SqlDiagnostic[] }`
- Define `LintContext` interface: `{ sql: string; tokens: SqlToken[]; dataExtensions?: DataExtension[] }`
- Extract each `get*Diagnostics` function to its own rule file: `prohibited-keywords.ts`, `cte-detection.ts`, `select-clause.ts`, `unbracketed-names.ts`, `ambiguous-fields.ts`
- Add new rules in modular structure: `aggregate-grouping.ts`, `unsupported-functions.ts`, `limit-prohibition.ts`, `offset-fetch-prohibition.ts`
- Keep `sql-lint.ts` as re-export for backwards compatibility
- Move shared tokenization utilities to `sql-lint/utils/tokenizer.ts`

**Maintain prereq Diagnostic Visibility**
- Keep `prereq` severity hidden (no squiggles) per current behavior
- No changes to `isMarkerDiagnostic` filter in `sql-diagnostics.ts`

## Visual Design
No visual mockups provided.

## Existing Code to Leverage

**`sql-lint.ts` (553 lines)**
- Contains existing `PROHIBITED_KEYWORDS` and `PROCEDURAL_KEYWORDS` sets to extend
- Has `createDiagnostic` helper function to reuse in new rules
- `splitSelectExpressions` and expression parsing logic useful for aggregate rule
- Pattern for tokenizing while respecting strings/brackets/comments

**`sql-context.ts` tokenization**
- `tokenizeSql` function provides token stream with depth tracking
- `SqlToken` interface already includes `type`, `value`, `startIndex`, `endIndex`, `depth`
- Reuse for new modular linter tokenization utility

**`MonacoQueryEditor.tsx` completion provider**
- Current `provideCompletionItems` async function at line 239-451 needs keyword logic fix
- Existing `SQL_KEYWORDS` array to filter and prioritize
- `getBracketReplacementRange` helper already handles bracket context

**`sql-lint.test.ts` test patterns**
- Follow existing Arrange-Act-Assert pattern with `lintSql(sql, { dataExtensions })` calls
- Tests check for message substrings and severity values
- Use similar structure for new rule tests

**`useClickOutside.ts` hook pattern**
- Shows hook pattern in `apps/web/src/hooks/`
- Create similar `useDebouncedValue` hook if not present using standard debounce pattern

## Out of Scope
- SELECT * in JOINs warning (future "hints" enhancement)
- "Hints" system for best practice suggestions
- Changes to `prereq` diagnostic visibility (keep hidden)
- Rule enable/disable configuration UI
- Rule severity override configuration
- Data View retention warnings for dates > 6 months
- Performance profiling or bundle size optimization
- Changes to Monaco editor theme or styling
- Mobile/responsive considerations for editor
- Any backend API changes
