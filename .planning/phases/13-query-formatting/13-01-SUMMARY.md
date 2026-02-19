---
phase: 13-query-formatting
plan: 01
subsystem: ui
tags: [sql-formatter, monaco-editor, formatting, t-sql, react-hooks]

requires:
  - phase: 02-saved-queries
    provides: tabs store with storeUpdateTabContent for editor content updates
provides:
  - formatSql() pure utility wrapping sql-formatter with T-SQL dialect
  - useFormatQuery() hook orchestrating format action with toast feedback
  - Shift+Alt+F keyboard shortcut for format document
  - SQL_TAB_SIZE shared constant (4 spaces)
affects: [editor-workspace, monaco-keybindings]

tech-stack:
  added: [sql-formatter@15.7.2]
  patterns: [pure-utility-plus-hook-orchestration, getter-pattern-keybinding]

key-files:
  created:
    - apps/web/src/features/editor-workspace/utils/format-sql.ts
    - apps/web/src/features/editor-workspace/hooks/use-format-query.ts
    - apps/web/src/features/editor-workspace/utils/format-sql.test.ts
    - apps/web/src/features/editor-workspace/hooks/__tests__/use-format-query.test.ts
  modified:
    - apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx
    - apps/web/src/features/editor-workspace/components/MonacoQueryEditor.tsx
    - apps/web/src/features/editor-workspace/components/monaco/register-sql-editor-keybindings.ts
    - apps/web/src/features/editor-workspace/types.ts

key-decisions:
  - "formatDialect with transactsql dialect object for tree-shaking (drops ~19 unused dialects)"
  - "functionCase: preserve to respect user convention (DATEADD vs dateadd)"
  - "dataTypeCase: upper for consistency with keyword casing"
  - "Trailing commas accepted (commaPosition removed in sql-formatter v15.x)"
  - "onFormat removed from EditorWorkspaceProps (format now self-contained)"

patterns-established:
  - "Pure utility + hook orchestration: formatSql() is pure, useFormatQuery() handles UI/store"
  - "Getter pattern for Monaco keybindings: getOnFormat prevents stale closures"

duration: 16min
completed: 2026-02-17
---

# Phase 13 Plan 01: Query Formatting Summary

**SQL formatting via toolbar button and Shift+Alt+F using sql-formatter T-SQL dialect with keyword uppercasing and MCE identifier preservation**

## Performance

- **Duration:** 16 min
- **Started:** 2026-02-17T21:35:32Z
- **Completed:** 2026-02-17T21:52:12Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Pure `formatSql()` utility wrapping sql-formatter with T-SQL dialect, keyword uppercasing, and MCE identifier preservation
- `useFormatQuery()` hook with empty editor and parse error toast feedback, store-driven content updates for undo preservation
- Shift+Alt+F keyboard shortcut registered via getter pattern in Monaco keybindings
- 25 tests (19 unit + 6 integration) covering MCE edge cases, error handling, and feature wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: Create format utility, hook, and wire into editor workspace** - `1b76e70` (feat)
2. **Task 2: Write unit tests for formatSql and integration tests for format feature** - `e5bb3e3` (test)

## Files Created/Modified
- `apps/web/src/features/editor-workspace/utils/format-sql.ts` - Pure formatting utility wrapping sql-formatter with T-SQL dialect config
- `apps/web/src/features/editor-workspace/hooks/use-format-query.ts` - Hook orchestrating format action with empty/error toast handling
- `apps/web/src/features/editor-workspace/utils/format-sql.test.ts` - 19 unit tests for formatSql utility
- `apps/web/src/features/editor-workspace/hooks/__tests__/use-format-query.test.ts` - 6 integration tests for useFormatQuery hook
- `apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx` - Wired useFormatQuery hook, passes handleFormat to toolbar and editor
- `apps/web/src/features/editor-workspace/components/MonacoQueryEditor.tsx` - Added onFormat prop with ref pattern for keybinding
- `apps/web/src/features/editor-workspace/components/monaco/register-sql-editor-keybindings.ts` - Added getOnFormat parameter and Shift+Alt+F binding
- `apps/web/src/features/editor-workspace/components/monaco/register-sql-editor-keybindings.test.ts` - Updated existing tests with getOnFormat parameter
- `apps/web/src/features/editor-workspace/types.ts` - Removed onFormat from EditorWorkspaceProps (now self-contained)
- `apps/web/package.json` - sql-formatter dependency
- `pnpm-lock.yaml` - Lock file update

## Decisions Made
- Used `formatDialect` with `transactsql` dialect object instead of `format` with language string for tree-shaking (drops ~19 unused dialect modules)
- `functionCase: 'preserve'` preserves user convention (DATEADD vs dateadd) while keywords are uppercased
- `dataTypeCase: 'upper'` ensures consistent uppercasing of data types alongside keywords
- Accepted trailing commas since `commaPosition: 'before'` was removed in sql-formatter v15.x
- Removed `onFormat` from `EditorWorkspaceProps` since format is now self-contained within the component

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated existing keybinding tests for new getOnFormat parameter**
- **Found during:** Task 1 (typecheck verification)
- **Issue:** Adding `getOnFormat` to `registerSqlEditorKeybindings` options made it a required parameter, breaking 6 existing test call sites
- **Fix:** Added `getOnFormat: () => undefined` to all 6 call sites in `register-sql-editor-keybindings.test.ts`
- **Files modified:** `apps/web/src/features/editor-workspace/components/monaco/register-sql-editor-keybindings.test.ts`
- **Verification:** `pnpm --filter @qpp/web typecheck` passes with zero errors
- **Committed in:** `1b76e70` (part of Task 1 commit)

**2. [Rule 3 - Blocking] Fixed deep relative import to use @/ alias**
- **Found during:** Task 2 (pre-commit ESLint hook)
- **Issue:** `../../utils/format-sql` import in hook test violated `no-restricted-imports` ESLint rule requiring `@/` alias for deep parent imports
- **Fix:** Changed to `@/features/editor-workspace/utils/format-sql` and updated vi.mock path
- **Files modified:** `apps/web/src/features/editor-workspace/hooks/__tests__/use-format-query.test.ts`
- **Verification:** ESLint passes, test still passes
- **Committed in:** `e5bb3e3` (part of Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness (type errors and lint violations). No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 13 Query Formatting is COMPLETE (1/1 plans)
- Format utility `formatSql()` is pure and reusable for future features (format on save, format on paste, format selection)
- `SQL_TAB_SIZE` constant exported for shared use between Monaco and formatter config
- All 2190 web tests pass with zero regressions

---
*Phase: 13-query-formatting*
*Completed: 2026-02-17*
