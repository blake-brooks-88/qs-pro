# Task Breakdown: Monaco Editor Audit Fixes

## Overview
Total Tasks: 6 Task Groups, ~45 sub-tasks

This spec addresses critical UX and SFMC compliance issues from a security/UX audit, adds new linting rules, and modularizes the linter for maintainability.

## Task List

### Linter Infrastructure

#### Task Group 1: Linter Modularization
**Dependencies:** None
**Specialization:** TypeScript/Architecture

This foundational refactor must happen first since all subsequent linting changes will use the new modular structure.

- [x] 1.0 Complete linter modularization
  - [x] 1.1 Write 4-6 focused tests for modular linter infrastructure
    - Test `LintRule` interface contract
    - Test rule aggregation in `lintSql` entry point
    - Test context object construction with tokens and dataExtensions
    - Test backwards compatibility of `sql-lint.ts` re-export
  - [x] 1.2 Create `sql-lint/` directory structure
    - Create `apps/web/src/features/editor-workspace/utils/sql-lint/`
    - Create subdirectories: `rules/`, `utils/`
  - [x] 1.3 Create `types.ts` with interfaces
    - Define `LintContext` interface: `{ sql: string; tokens: SqlToken[]; dataExtensions?: DataExtension[] }`
    - Define `LintRule` interface: `{ id: string; name: string; check: (context: LintContext) => SqlDiagnostic[] }`
    - Export `SqlDiagnostic` and severity types
  - [x] 1.4 Create `utils/tokenizer.ts`
    - Move shared tokenization utilities from `sql-context.ts`
    - Export `tokenizeSql` function for rule usage
  - [x] 1.5 Extract existing rules to individual files
    - `rules/prohibited-keywords.ts` - DML/DDL/procedural detection
    - `rules/cte-detection.ts` - WITH...AS detection
    - `rules/select-clause.ts` - Empty SELECT, literal aliases
    - `rules/unbracketed-names.ts` - Space in DE names
    - `rules/ambiguous-fields.ts` - Unqualified fields in JOINs
  - [x] 1.6 Create `sql-lint/index.ts` entry point
    - Import all rules
    - Create `rules` array
    - Implement `lintSql` function that aggregates rule results
    - Re-export types
  - [x] 1.7 Update original `sql-lint.ts` for backwards compatibility
    - Re-export everything from `sql-lint/index.ts`
    - Ensure existing imports continue to work
  - [x] 1.8 Ensure linter infrastructure tests pass
    - Run tests from 1.1
    - Run existing `sql-lint.test.ts` to verify no regressions

**Acceptance Criteria:**
- All existing linting tests pass unchanged
- New modular structure in place
- Original import paths still work
- Each rule is isolated in its own file

---

### SFMC Compliance Rules

#### Task Group 2: Prohibited Keywords & CTE Detection
**Dependencies:** Task Group 1
**Specialization:** TypeScript/SQL Parsing

- [x] 2.0 Complete SFMC compliance rules
  - [x] 2.1 Write 6-8 focused tests for compliance rules
    - Test new prohibited keywords: `CREATE`, `EXEC`, `GRANT`, `BEGIN`, `CURSOR`, `BACKUP`
    - Test new procedural keywords: `IF`, `ELSE`, `TRY`, `CATCH`, `WAITFOR`
    - Test CTE with column syntax: `WITH cte (col1, col2) AS ...`
    - Test multi-CTE: `WITH cte1 AS (...), cte2 AS (...)`
    - Test LIMIT keyword detection and error message
    - Test OFFSET/FETCH pagination detection
  - [x] 2.2 Extend `PROHIBITED_KEYWORDS` set in `prohibited-keywords.ts`
    - Add: `create`, `exec`, `execute`, `grant`, `revoke`
    - Add: `begin`, `commit`, `rollback`, `savepoint`
    - Add: `cursor`, `fetch`, `open`, `close`, `deallocate`
    - Add: `backup`, `restore`, `kill`
  - [x] 2.3 Extend `PROCEDURAL_KEYWORDS` set
    - Add: `if`, `else`, `return`, `throw`
    - Add: `try`, `catch`, `waitfor`, `raiserror`
  - [x] 2.4 Create `rules/limit-prohibition.ts`
    - Detect `LIMIT` keyword usage
    - Error severity (blocks RUN)
    - Message: "LIMIT is not supported in Marketing Cloud SQL. Use TOP instead."
  - [x] 2.5 Create `rules/offset-fetch-prohibition.ts`
    - Detect `OFFSET...FETCH` pagination pattern
    - Detect `OFFSET` followed by `FETCH NEXT` or `FETCH FIRST`
    - Error severity (blocks RUN)
    - Message: "OFFSET/FETCH pagination is not supported in Marketing Cloud SQL. Use TOP for row limiting."
  - [x] 2.6 Improve CTE detection in `cte-detection.ts`
    - Upgrade severity from `warning` to `error`
    - Improve regex to catch `WITH cte_name (columns) AS ...`
    - Improve regex to catch multi-CTE: `WITH cte1 AS (...), cte2 AS (...)`
    - Message: "CTEs are not supported in Marketing Cloud SQL. Use subqueries instead."
  - [x] 2.7 Register new rules in `sql-lint/index.ts`
    - Add `limitProhibitionRule`
    - Add `offsetFetchProhibitionRule`
  - [x] 2.8 Ensure compliance rule tests pass
    - Run tests from 2.1
    - Verify error severities block RUN button

**Acceptance Criteria:**
- All new prohibited keywords are detected
- CTE detection upgraded to error severity
- LIMIT and OFFSET/FETCH are blocked with clear messages
- All compliance tests pass

---

#### Task Group 3: New Linting Rules
**Dependencies:** Task Group 1
**Specialization:** TypeScript/SQL Parsing

- [x] 3.0 Complete new linting rules
  - [x] 3.1 Write 6-8 focused tests for new rules
    - Test unsupported function warnings: `string_agg`, `try_convert`, `json_modify`
    - Test supported functions don't warn: `json_value`, `json_query`
    - Test aggregate without GROUP BY: `SELECT Region, COUNT(*) FROM [Table]`
    - Test valid aggregate (no GROUP BY needed): `SELECT COUNT(*) FROM [Table]`
    - Test proper GROUP BY doesn't warn: `SELECT Region, COUNT(*) FROM [Table] GROUP BY Region`
    - Test edge case: `COUNT(DISTINCT x)` is aggregated
    - Test edge case: `SELECT *, COUNT(x)` should warn
  - [x] 3.2 Create `rules/unsupported-functions.ts`
    - Define unsupported functions list: `string_agg`, `string_split`, `json_modify`, `openjson`, `isjson`, `try_convert`, `try_cast`, `try_parse`
    - Use `warning` severity
    - Message: "This function may not be supported in Marketing Cloud SQL"
    - Note: Do NOT flag `json_value` or `json_query` (supported)
  - [x] 3.3 Create `rules/aggregate-grouping.ts`
    - Detect SELECT with aggregate functions (COUNT, SUM, AVG, MIN, MAX)
    - Check for GROUP BY clause when aggregates detected
    - Use `error` severity (SFMC rejects at runtime)
    - Message: `Column "{fieldName}" must appear in GROUP BY clause or be used in an aggregate function`
  - [x] 3.4 Handle aggregate rule edge cases
    - `COUNT(DISTINCT x)` - column is aggregated
    - `UPPER(x)` without GROUP BY - should warn
    - Subquery aggregates don't affect outer scope
    - Literal values don't need grouping: `SELECT 'Total', COUNT(*)`
  - [x] 3.5 Register new rules in `sql-lint/index.ts`
    - Add `unsupportedFunctionsRule`
    - Add `aggregateGroupingRule`
  - [x] 3.6 Ensure new rule tests pass
    - Run tests from 3.1
    - Verify warning vs error severities correct

**Acceptance Criteria:**
- Unsupported functions flagged with warnings
- Aggregate/GROUP BY mismatches flagged with errors
- Edge cases handled correctly
- All new rule tests pass

---

### Autocomplete & UX Fixes

#### Task Group 4: Autocomplete Consistency
**Dependencies:** None (can run parallel with Task Groups 2-3)
**Specialization:** TypeScript/Monaco Editor

- [x] 4.0 Complete autocomplete fixes
  - [x] 4.1 Write 4-6 focused tests for autocomplete behavior
    - Test keywords appear as fallback in all contexts
    - Test contextual keyword prioritization via `sortText`
    - Test trigger characters: `,`, `)`, `\n`, `\t`
    - Test suggestions only appear when user is typing (not idle cursor)
  - [x] 4.2 Fix fallthrough logic in `provideCompletionItems`
    - Ensure keywords are always returned as fallback suggestions
    - Reference `MonacoQueryEditor.tsx` lines 239-451
    - Keywords should never disappear based on cursor position
  - [x] 4.3 Add `getContextualKeywords` helper function
    - Determine priority keywords based on `lastKeyword` context
    - After WHERE: prioritize AND, OR, IN, NOT, LIKE, BETWEEN
    - After SELECT: prioritize DISTINCT, TOP, AS
    - After FROM: prioritize WHERE, JOIN, LEFT, RIGHT, INNER, ON
    - After JOIN: prioritize ON, WHERE
  - [x] 4.4 Implement `sortText` prioritization
    - Use `sortText` to rank contextually relevant keywords higher
    - Lower sortText values = higher priority
    - Pattern: `'0-' + keyword` for high priority, `'1-' + keyword` for normal
  - [x] 4.5 Add missing `triggerCharacters`
    - Add `,` - for column lists
    - Add `)` - after subqueries/functions
    - Add `\n` - new lines
    - Add `\t` - tabs
  - [x] 4.6 Ensure suggestions only appear when typing
    - Check that suggestions don't show on idle cursor
    - Only trigger when user actively types
  - [x] 4.7 Ensure autocomplete tests pass
    - Run tests from 4.1
    - Manual verification of suggestion behavior

**Acceptance Criteria:**
- SQL keywords always available as fallback
- Contextually relevant keywords prioritized
- All trigger characters work
- No suggestions on idle cursor

---

#### Task Group 5: Performance & Race Condition Fixes
**Dependencies:** None (can run parallel with Task Groups 2-4)
**Specialization:** TypeScript/React Hooks

- [x] 5.0 Complete performance fixes
  - [x] 5.1 Write 4-6 focused tests for performance fixes
    - Test debounced decoration updates (150ms)
    - Test async field fetching with cancellation
    - Test no UI flicker during fast typing
    - Test stale closure fix for `getJoinSuggestions`
  - [x] 5.2 Create or verify `useDebouncedValue` hook
    - Check `apps/web/src/hooks/` for existing implementation
    - If not present, create with standard debounce pattern
    - Support configurable delay (default 150ms)
  - [x] 5.3 Implement debounced decoration updates
    - Apply 150ms debounce to decoration updates
    - Target `useEffect` at lines 645-695 in `MonacoQueryEditor.tsx`
    - Debounce `extractTableReferences` and `extractSelectFieldRanges` calls
  - [x] 5.4 Fix async field fetching race condition
    - Implement AbortController pattern for cancellation
    - Or use debouncing to prevent rapid sequential requests
    - Prevent UI flicker when user types faster than network responses
  - [x] 5.5 Fix stale closure in inline completion provider
    - Add `getJoinSuggestions` to dependency array in `handleEditorMount` useCallback
    - Reference line 610-618 in `MonacoQueryEditor.tsx`
  - [x] 5.6 Ensure performance tests pass
    - Run tests from 5.1
    - Manual verification with large SQL files

**Acceptance Criteria:**
- Decoration updates debounced at 150ms
- No race condition flicker during fast typing
- Stale closure fixed
- Large files (5000+ lines) don't cause lag

---

### Integration & Testing

#### Task Group 6: Test Review & Integration
**Dependencies:** Task Groups 1-5
**Specialization:** Testing/QA

- [x] 6.0 Review and integrate all changes
  - [x] 6.1 Review tests from Task Groups 1-5
    - Review linter infrastructure tests (Task 1.1)
    - Review compliance rule tests (Task 2.1)
    - Review new rule tests (Task 3.1)
    - Review autocomplete tests (Task 4.1)
    - Review performance tests (Task 5.1)
    - Total existing tests: approximately 24-34 tests
  - [x] 6.2 Analyze test coverage gaps for this feature
    - Focus ONLY on gaps related to this spec's requirements
    - Check integration between autocomplete and linting
    - Check that error severities properly block RUN button
    - Verify backwards compatibility of imports
  - [x] 6.3 Write up to 10 additional strategic tests
    - Integration test: Full linting pipeline with all new rules
    - Integration test: Autocomplete with new trigger characters
    - Regression test: Existing lint behavior unchanged
    - Edge case: Complex SQL with multiple rule violations
  - [x] 6.4 Run feature-specific tests only
    - Run all tests from groups 1-5 plus new tests
    - Expected total: approximately 34-44 tests
    - Verify all tests pass
  - [x] 6.5 Verify `prereq` diagnostic visibility unchanged
    - Confirm `prereq` severity still hidden (no squiggles)
    - Verify `isMarkerDiagnostic` filter in `sql-diagnostics.ts` unchanged
  - [x] 6.6 Final type check and lint
    - Run `pnpm typecheck` for all packages
    - Run `pnpm lint` for all packages
    - Fix any TypeScript errors or lint violations

**Acceptance Criteria:**
- All feature-specific tests pass (34-44 tests total) ✓
- No regressions in existing functionality ✓
- Type check passes with 0 errors (3 pre-existing errors unchanged) ✓
- Lint passes with 0 errors (pre-existing lint warnings unchanged, new test file formatted correctly) ✓
- `prereq` visibility unchanged ✓

---

## Execution Order

Recommended implementation sequence:

```
Phase 1: Foundation
├── Task Group 1: Linter Modularization (FIRST - enables all linting work)

Phase 2: Parallel Work (can run concurrently)
├── Task Group 2: Prohibited Keywords & CTE Detection
├── Task Group 3: New Linting Rules
├── Task Group 4: Autocomplete Consistency
├── Task Group 5: Performance & Race Condition Fixes

Phase 3: Integration
└── Task Group 6: Test Review & Integration (LAST - after all features complete)
```

**Note:** Task Groups 2-5 can be worked in parallel since they touch different files:
- Groups 2 & 3: `sql-lint/rules/*.ts` (separate rule files)
- Group 4: `MonacoQueryEditor.tsx` autocomplete logic
- Group 5: `MonacoQueryEditor.tsx` hooks and `apps/web/src/hooks/`

---

## Key Files Reference

| File | Task Groups | Purpose |
|------|-------------|---------|
| `sql-lint.ts` | 1 | Re-export for backwards compatibility |
| `sql-lint/index.ts` | 1, 2, 3 | Main linter entry point |
| `sql-lint/types.ts` | 1 | Interfaces and types |
| `sql-lint/rules/*.ts` | 1, 2, 3 | Individual lint rules |
| `MonacoQueryEditor.tsx` | 4, 5 | Autocomplete and performance |
| `sql-diagnostics.ts` | 6 | Verify prereq behavior |
| `apps/web/src/hooks/` | 5 | Debounce utilities |

---

## Testing Constraints

Per project standards:
- Each task group writes 4-8 focused tests maximum
- Tests cover only critical behaviors, not exhaustive coverage
- Task Group 6 adds maximum 10 additional tests for gaps
- Total expected tests: 34-44 for this feature
- Follow Arrange-Act-Assert pattern from existing `sql-lint.test.ts`
