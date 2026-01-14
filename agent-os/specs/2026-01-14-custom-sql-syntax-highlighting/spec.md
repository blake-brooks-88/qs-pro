# Specification: Custom MCE SQL Syntax Highlighting

## Goal

Fix and enhance Monaco SQL syntax highlighting in QS Pro so that:
- MCE-supported SQL keywords are consistently highlighted (including JOIN variants)
- Table and field references are visibly highlighted (semantic highlighting)
- Prohibited keywords and unsupported functions are highlighted in an error style without false positives inside identifiers, strings, or comments

All MCE-specific behavior must align with:
`apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`

## User Stories

- As an MCE Architect, I want accurate syntax highlighting that matches Marketing Cloud SQL rules so I can spot invalid syntax quickly.
- As a Campaign Manager, I want tables and fields to be visually distinct so I can read queries faster and avoid mistakes.

## Specific Requirements

### Language Strategy (Minimal Custom Wiring)

- Prefer minimal custom wiring:
  - Keep Monaco language id as `"sql"` to preserve existing editor configuration and completion providers.
  - Add a custom tokenization/highlighting layer that is MCE-focused.

### Highlighting Architecture (Lexical + Semantic)

- The editor must support two complementary highlighting layers:
  - **Lexical highlighting** (token-based): keywords, strings, comments, numbers, operators, punctuation, identifiers, function calls.
  - **Semantic highlighting** (range-based): tables, fields, aliases, and error-style emphasis for linter-detected violations.
- The semantic layer must not fight the lexical layer (semantic should “win” when overlapping).

### Lexical Highlighting: Core Tokenization

Lexical tokenization must correctly recognize and style:
- **Comments**
  - Line: `-- ...` to newline
  - Block: `/* ... */`
- **Strings**
  - Single quotes only: `'...'` with escaped single quotes `''`
  - Double quotes are **identifiers**, not strings
- **Identifiers**
  - Bracketed identifiers: `[...]` (single token), including `]]` escape support (SQL Server style)
  - Double-quoted identifiers: `"..."` (single token), including `""` escape support
  - Identifiers must “shield” their contents from keyword/prohibited highlighting
- **Numbers**
  - Integers and decimals
- **Operators & punctuation**
  - Logical: `AND`, `OR`, `NOT` (styled as keywords)
  - Comparison: `=`, `!=`, `<>`, `<`, `>`, `<=`, `>=`
  - Arithmetic: `+`, `-`, `*`, `/`
  - Punctuation: `.`, `,`, `;`, `(`, `)`

### Lexical Highlighting: Supported Keywords (MCE Only)

- Keyword highlighting must be limited to MCE-supported keywords/clauses/operators from the MCE reference and must be case-insensitive.
- At minimum, keyword set must include:
  - **Statement**: `SELECT`
  - **Clauses**: `FROM`, `WHERE`, `JOIN`, `ON`, `GROUP`, `BY`, `HAVING`, `ORDER`, `UNION`, `ALL`, `INTERSECT`, `EXCEPT`, `DISTINCT`, `TOP`
  - **JOIN variants**: `INNER`, `LEFT`, `RIGHT`, `FULL`, `OUTER`, `CROSS`
  - **Ordering**: `ASC`, `DESC`
  - **Predicates/operators**: `AND`, `OR`, `NOT`, `LIKE`, `IN`, `BETWEEN`, `EXISTS`, `IS`, `NULL`
  - **OFFSET/FETCH** (supported with requirements per reference): `OFFSET`, `FETCH`, `NEXT`, `FIRST`, `ROWS`, `ROW`, `ONLY`
  - **Control flow expressions**: `CASE`, `WHEN`, `THEN`, `ELSE`, `END`, `IIF`
  - **Null handling**: `ISNULL`, `COALESCE`, `NULLIF` (function tokens or keyword tokens are acceptable as long as styled consistently)
- Join constructs must be styled consistently (e.g., `INNER JOIN` should bold both `INNER` and `JOIN`).

### Identifiers (No False Positives)

- Bracketed identifiers `[...]` must be treated as identifiers and must prevent keyword/prohibited highlighting inside the brackets.
- Double-quoted identifiers `"..."` must be treated as identifiers (not strings) and must prevent keyword/prohibited highlighting inside the quotes.
- Strings and comments must not contain highlighted keywords/prohibited/unsupported styling.

### Function Calls

- Function calls must be styled as functions when an identifier is followed by `(` (after optional whitespace), excluding cases where the identifier is inside strings/comments/identifiers.
- Unsupported functions must be styled as error (see “Error-Style Highlighting”).

### Error-Style Highlighting (Prohibited + Unsupported)

- Prohibited keywords and unsupported functions must be highlighted in an error style.
- To avoid false positives and ambiguous keyword handling, error-style highlighting should be driven by the linter’s precise ranges (diagnostics), not by blanket token matching.
  - Example: only highlight `WITH` as error when it is a CTE (not `WITH (NOLOCK)`).
- Error-style highlighting must not apply inside identifiers, strings, or comments.

### Tables & Fields (Semantic Highlighting)

- Fix and ensure semantic table and field highlighting:
  - Tables are currently highlighted via Monaco decorations, but users report they are not being highlighted. This must be corrected.
  - Fields are currently highlighted via Monaco decorations, but users report they are not being highlighted. This must be corrected.
- Table references must be visibly highlighted (e.g., FROM/JOIN targets), including:
  - bracketed DE names (preferred)
  - `ENT.` prefix pattern for shared/parent BU tables
  - aliased table references (`FROM [Table] t`, `JOIN [Table] AS t`)
  - excluding subquery “tables”
- Field references must be visibly highlighted. At minimum:
  - fields in the SELECT list
  - field aliases in the SELECT list
- Semantic table/field highlighting must continue to work correctly alongside token-based highlighting.

### Data Types

- Use a SQL Server–oriented data type set.
- Prefer context-aware type highlighting (e.g., `CAST(... AS <type>)`, `CONVERT(<type>, ...)`) to reduce false positives.

### Theme & Styling

- Use existing theme semantic tokens for normal syntax (keywords, strings, numbers, operators, comments).
- Use existing error/warning colors for invalid/prohibited/unsupported highlighting, but avoid reusing those colors for normal syntax tokens so the meaning remains clear.
- Ensure table/field/alias semantic colors are present and distinct (e.g., `--syntax-table`, `--syntax-field`, `--syntax-alias`).

## Acceptance Criteria

- **Keywords**
  - `SELECT`, `FROM`, `INNER JOIN`, `LEFT JOIN`, `GROUP BY`, `ORDER BY` are consistently styled as keywords.
- **Identifiers**
  - `[Update Log]` does not style `Update` as prohibited.
  - `"Update Log"` does not style `Update` as prohibited.
- **Prohibited keywords**
  - `UPDATE`, `INSERT`, `DELETE`, `DROP`, `ALTER`, `CREATE`, procedural keywords (`DECLARE`, `SET`, `WHILE`, `PRINT`, etc.) render in error style (when not inside identifiers/strings/comments).
- **Unsupported functions**
  - `STRING_AGG(...)`, `OPENJSON(...)`, `TRY_CONVERT(...)` render in error style when invoked as functions.
- **Tables/fields**
  - FROM/JOIN targets render in table style.
  - SELECT list fields and aliases render in field/alias style.

## Visual Design

No visual assets provided.

## Existing Code to Leverage

- Editor + Monaco wiring: `apps/web/src/features/editor-workspace/components/MonacoQueryEditor.tsx`
  - Keeps `language="sql"` and existing completion providers
  - Already applies semantic decorations for table/field ranges
- Theme token mapping: `apps/web/src/features/editor-workspace/utils/monaco-options.ts`
- Semantic table/field extraction: `apps/web/src/features/editor-workspace/utils/sql-context.ts`
- MCE rules source-of-truth: `apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`
- Prohibited/unsupported detection logic: `apps/web/src/features/editor-workspace/utils/sql-lint/`

## Out of Scope

- Query execution, formatting/pretty-printing, or “run” behavior changes.
- Autocomplete behavior changes unrelated to highlighting.
