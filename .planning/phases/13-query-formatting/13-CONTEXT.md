# Phase 13: Query Formatting - Context

**Gathered:** 2026-02-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a toolbar button (and keyboard shortcut) to prettify/format the SQL query in the active editor tab. Formatting transforms whitespace, indentation, and keyword casing for readability without changing query semantics. This is a frontend-only feature using a client-side formatting library.

</domain>

<decisions>
## Implementation Decisions

### Formatting library
- Use **sql-formatter** npm package (v15.x) — only JavaScript library with full T-SQL dialect support
- T-SQL dialect (`language: 'tsql'`) — MCE runs on SQL Server; T-SQL handles bracket identifiers and SQL Server functions natively
- Alternatives evaluated and rejected:
  - **prettier-plugin-sql-cst** — no T-SQL support (only SQLite/BigQuery stable)
  - **prettier-plugin-sql** — thin wrapper around sql-formatter, no additional value
  - **poor-mans-t-sql-formatter** — unmaintained, low adoption
- sql-formatter is in maintenance mode (bugs fixed, no new features) — acceptable for a stable formatting use case

### Formatting style
- **Keyword casing:** UPPERCASE (`keywordCase: 'upper'`) — SELECT, FROM, WHERE, JOIN
- **Identifier casing:** PRESERVE (`identifierCase` not set, defaults to preserve) — DE names, column names, system data views stay as-written
- **Indentation:** 4 spaces (`tabWidth: 4`) — matches Monaco editor default
- **Commas:** Leading (`commaPosition: 'before'`) — SFMC community convention; easier to add/remove columns; better git diffs
- Define explicit constants (e.g., `SQL_TAB_SIZE = 4`) shared between Monaco editor options and formatter config

### MCE-specific edge cases (research must verify)
- **Bracket identifiers** — `[My Data Extension]`, `[_Subscribers]` — sql-formatter treats these as quoted identifiers and preserves them (no case change)
- **`Ent.` prefix** — `FROM Ent.SharedDE` for shared Data Extensions from child BUs — should be uppercased if safe, or left as-is if risky. Research must verify behavior.
- **System data views** — `FROM _Job`, `FROM _Subscribers` — preserve exactly as-written (these are proper nouns, not keywords)
- **MCE functions** — `DATEADD()`, `GETDATE()`, `CONVERT()` — standard T-SQL functions, should format correctly
- **DE names must never be uppercased** — MCE SQL is case-insensitive, but users write DE names as-is and expect them preserved
- **No double-quote identifier support needed** — MCE uses brackets, not double quotes

### Architecture
- **Pure utility function** `formatSql(sql: string): string` — string in, formatted string out; no side effects; lives in `utils/format-sql.ts`
- **Hook** `useFormatQuery()` — orchestrates: validate input → call formatSql → update store via `storeUpdateTabContent()` → toast on error
- Follows existing patterns: `use-publish-flow.ts`, `use-save-flows.ts` (hook + utility separation)
- Content updates via Zustand `storeUpdateTabContent()` — triggers React re-render → Monaco receives new `value` prop → undo history preserved automatically
- **Do NOT use `editor.setValue()` directly** — bypasses React state; use Zustand store update path

### Scope & selection
- **Whole editor only** — format button always formats the entire active tab content
- Single statement assumption — MCE does not support multiple statements; multiple statements are already a lint error
- **No blocking on lint errors** — formatting runs regardless of lint status; user may format to improve readability before fixing errors

### Trigger & feedback
- **Toolbar button** already exists in `EditorToolbar.tsx` — wired to optional `onFormat` prop; just needs to be connected
- **Keyboard shortcut:** Shift+Alt+F (matches VS Code "Format Document" convention) — register in `register-sql-editor-keybindings.ts` using getter pattern to avoid stale closures
- **No success feedback** — the reformatted SQL in the editor IS the feedback
- **Error feedback:** Toast warning only on parse failure ("Could not format query")
- **Empty editor:** Toast warning "No SQL to format" — no crash, no state change

### Availability & tier
- Available on **all tabs** (untitled, saved, imported) — only the currently active tab
- **Free for all users** — no tier gating; formatting is basic editor quality-of-life
- No new feature flag needed

### Testing strategy
- **Unit tests** for `formatSql()` utility:
  - MCE edge cases: bracket identifiers, `Ent.` prefix, system data views, MCE functions
  - Messy SQL → properly formatted output
  - Already-formatted SQL → idempotent (no change)
  - Empty/whitespace-only input → handled gracefully
  - Keywords uppercased, identifiers preserved, leading commas applied
- **Integration tests** for toolbar interaction:
  - Format button visible and clickable on all tab types
  - Click format → editor content updates
  - Shift+Alt+F keyboard shortcut triggers formatting
  - Empty editor → toast warning, no crash
  - Parse failure → toast warning, editor content unchanged
- Tests follow `testing-test-quality` skill: behavioral assertions, AAA structure, no mock-heavy patterns

### Error states
- **Parse failure:** Toast warning "Could not format query" — editor content unchanged, user can fix SQL and retry
- **Empty editor:** Toast warning "No SQL to format" — no state change
- **No other error states expected** — sql-formatter is tokenizer-based, failures are extremely rare

### Observability
- **No tracking needed** — pure client-side feature; Sentry auto-captures any unhandled errors
- No breadcrumbs, no usage metrics — formatting is a basic editor action

### Claude's Discretion
- Button placement and ordering within the existing editor toolbar
- Exact sql-formatter configuration options beyond the decisions above (e.g., `linesBetweenQueries`, `expressionWidth`)
- Whether `Ent.` prefix gets uppercased or preserved (depends on research verification)

</decisions>

<specifics>
## Specific Ideas

- Toolbar button already exists in `EditorToolbar.tsx` with `onFormat` prop — this is a wiring task, not a new button creation
- Keyboard shortcut uses existing `register-sql-editor-keybindings.ts` getter pattern (like `getOnSave`)
- `storeUpdateTabContent()` is the correct API for editor content updates — preserves undo history via Monaco's controlled component pattern
- The `formatSql()` utility is deliberately kept pure for reuse by future features (format on save, format on paste, format selection)
- Research phase should run sql-formatter against representative MCE queries to verify T-SQL dialect behavior before implementation

</specifics>

<deferred>
## Deferred Ideas

- **Format on save** — auto-format SQL on Ctrl+S. Would leverage the same `formatSql()` utility. Could be a tenant/user setting.
- **Format on paste** — auto-format SQL when pasting into the editor. Could be toggled via a setting.
- **Format selection only** — format just the highlighted text. Could be added if users request it.
- **Configurable formatting preferences** — user-selectable indentation, keyword casing, comma style. Could be a settings panel in a future phase.

</deferred>

---

*Phase: 13-query-formatting*
*Context gathered: 2026-02-17*
