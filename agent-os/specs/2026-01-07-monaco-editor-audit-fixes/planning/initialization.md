# Spec Initialization

## Raw Idea (User's Exact Description)

Monaco Editor Red Team Audit Report - SFMC SQL IDE Implementation Review

This spec addresses findings from a comprehensive security and UX audit of the Monaco Editor implementation. The audit identified:

### Critical UX Failures (3 issues, High severity)
1. **Autocomplete Inconsistency Bug** - SQL keywords only appear in specific contexts due to fallthrough logic flaw in `provideCompletionItems` function
2. **Missing triggerCharacters** - Missing `,`, `)`, and `\n` trigger characters for keyword completion
3. **Race Condition** - Async field fetching without debouncing or cancellation causes flicker with fast typing

### SFMC Compliance Gaps (4 issues, Medium-High severity)
1. **Incomplete Prohibited Keyword Detection** - Missing EXEC, CREATE, GRANT, REVOKE, BACKUP, RESTORE, BEGIN/COMMIT/ROLLBACK, CURSOR
2. **CTE Detection Too Lenient** - Only warns instead of errors; misses multi-CTE and column syntax
3. **No SELECT * Warning for Joins** - Missing best practice warning
4. **No Detection of Unsupported Functions** - STRING_AGG, JSON functions, TRY_CONVERT, OFFSET/FETCH not flagged

### Logic & Code Interaction Bugs (4 issues, Medium severity)
1. **Stale Closure References** - `getJoinSuggestions` not in dependency array for inline completion provider
2. **Decoration Flicker on Large Files** - No debouncing on decoration updates causes lag on 5000+ line queries
3. **Marker Update Race Condition** - Timing issue between parent state update and child marker update
4. **Error Decorations Not Clearing Correctly** - `prereq` severity diagnostics don't show squiggles

### Priority Fix Order (from audit)
1. Autocomplete inconsistency - Fix fallthrough logic and add missing trigger characters
2. Missing SFMC prohibited keywords - Users could write CREATE TABLE without warning
3. CTE detection severity - Should be error, not warning
4. Performance debouncing - Critical for large queries

### Key Files Referenced
- `MonacoQueryEditor.tsx` (lines 219-695)
- `sql-lint.ts` (lines 9-181)
- `sql-diagnostics.ts` (lines 10-55)
- `EditorWorkspace.tsx` (lines 100-103)
