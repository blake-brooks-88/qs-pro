# Task Breakdown: Custom MCE SQL Syntax Highlighting

## Overview
Total Tasks: 5 Task Groups (20–30 subtasks)

This spec adds MCE-focused SQL syntax highlighting in Monaco while preserving existing editor wiring (`language="sql"`), and fixes missing/ineffective semantic highlighting for tables and fields. Prohibited keywords and unsupported functions must be highlighted in an error style without false positives inside identifiers, strings, or comments.

Reference source-of-truth:
`apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`

## Task List

### Task Group 1: Audit Current Highlighting + Identify Root Cause
**Dependencies:** None
**Specialization:** Frontend/Monaco

- [x] 1.0 Reproduce current highlighting issues
  - [x] 1.1 Confirm tables/fields are not visually highlighted (FROM/JOIN targets, SELECT list fields)
  - [x] 1.2 Confirm join variants (`INNER JOIN`) are not styled as keywords consistently
  - [x] 1.3 Determine whether semantic decorations exist but are overridden (CSS specificity/order) vs missing ranges
  - [x] 1.4 Capture 2–3 representative SQL snippets for manual verification

**Acceptance Criteria:**
- Clear root cause identified for table/field highlight failure (CSS precedence vs extraction vs Monaco rendering)

---

### Task Group 2: Centralize MCE SQL Constants (Prevent Drift)
**Dependencies:** Task Group 1
**Specialization:** TypeScript/Architecture

- [x] 2.0 Create shared constants for MCE SQL highlighting/lint alignment
  - [x] 2.1 Add TS module that enumerates:
    - Supported keywords/clauses/operators (MCE-only)
    - Prohibited keywords (DML/DDL/procedural/etc.)
    - Unsupported functions (as function calls)
    - SQL Server–oriented data types list (for highlighting)
  - [x] 2.2 Ensure constants match `MCE-SQL-REFERENCE.md`
  - [x] 2.3 Refactor linter rules (where appropriate) to import shared prohibited/unsupported sets (no behavior change)
  - [x] 2.4 Add/adjust unit tests where patterns exist to prevent regressions

**Acceptance Criteria:**
- No duplicated lists across linter/highlighter for prohibited/unsupported sets
- Tests confirm list coverage for key examples (INSERT/UPDATE/DELETE, DECLARE/SET, STRING_AGG/OPENJSON)

---

### Task Group 3: Implement MCE-Focused Lexical Highlighting (Monarch Tokenizer)
**Dependencies:** Task Group 2
**Specialization:** Frontend/Monaco

- [x] 3.0 Add custom tokenizer for `"sql"` that:
  - [x] 3.1 Treats `'...'` as strings (supports `''` escapes)
  - [x] 3.2 Treats `"..."` as identifiers (supports `""` escapes)
  - [x] 3.3 Treats `[...]` as identifiers (supports `]]` escapes)
  - [x] 3.4 Highlights supported keywords (case-insensitive) including join variants and multi-token constructs (`GROUP BY`, `ORDER BY`, `UNION ALL`)
  - [x] 3.5 Highlights function calls as functions (identifier + optional whitespace + `(`)
  - [x] 3.6 Highlights numbers, comments, operators, and punctuation using Monaco conventions
  - [x] 3.7 Ensures keywords/prohibited/unsupported are NOT highlighted inside identifiers/strings/comments

**Acceptance Criteria:**
- `SELECT`, `FROM`, `INNER JOIN`, `GROUP BY`, `ORDER BY` are consistently styled as keywords
- `"Some Identifier"` is styled as identifier (not string)
- `[Update Log]` does not style `Update` as prohibited

---

### Task Group 4: Fix & Extend Semantic Highlighting (Tables/Fields + Error-Style)
**Dependencies:** Task Group 1
**Specialization:** Frontend/Monaco

- [x] 4.0 Table and field semantic highlighting
  - [x] 4.1 Fix table highlighting visibility (ensure `.monaco-de-name` wins over Monaco token colors)
  - [x] 4.2 Fix field highlighting visibility (ensure `.monaco-field-name` / `.monaco-field-alias` wins)
  - [x] 4.3 Verify ENT handling is highlighted as a single table range (`ENT.[DEName]`)
  - [x] 4.4 Confirm subqueries are excluded from table highlighting
- [x] 4.5 Add error-style semantic highlighting driven by linter diagnostics
  - [x] 4.6 Render prohibited keywords and unsupported function ranges with an "error token" style using decoration ranges from diagnostics
  - [x] 4.7 Ensure ambiguous `WITH` is only error-highlighted for CTE diagnostics (not `WITH (NOLOCK)`)
  - [x] 4.8 Ensure diagnostics-driven styling does not apply inside identifiers/strings/comments (linter ranges should already enforce this; verify)

**Acceptance Criteria:**
- FROM/JOIN targets render in table style; SELECT list fields/aliases render in field/alias style
- `UPDATE`/`DECLARE` render in error style (when not inside `[...]` / `"..."` / comments / strings)
- `WITH (NOLOCK)` is not error-highlighted; CTE `WITH x AS (` is error-highlighted

---

### Task Group 5: Theme + Verification
**Dependencies:** Task Groups 3–4
**Specialization:** Frontend/Polish

- [x] 5.0 Theme token mapping and CSS
  - [x] 5.1 Add/adjust Monaco theme token rules for any new tokens (types, identifiers, control-flow keywords) without reusing error/warning colors for normal syntax
  - [x] 5.2 Add/adjust CSS classes for semantic highlighting and error-style decorations as needed
- [x] 5.3 Verification
  - [x] 5.4 Add focused unit tests for any pure helpers introduced (e.g., diagnostics→decorations mapping)
  - [x] 5.5 Run `pnpm --filter @qpp/web test` (or the smallest relevant test command used in this repo)
  - [x] 5.6 Manual QA in the editor with the acceptance-criteria SQL snippets

**Acceptance Criteria:**
- Web tests pass for touched areas
- Manual QA confirms all acceptance criteria in `spec.md`
