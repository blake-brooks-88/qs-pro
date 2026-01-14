# Spec Requirements: Custom SQL Syntax Highlighting

## Initial Description

Implement custom SQL syntax highlighting for the QS Pro Monaco query editor to better match Salesforce Marketing Cloud Engagement (MCE) SQL.

Highlighting must cover keywords, functions, data types, strings, numbers, comments, operators, punctuation, and identifiers, and it must add distinct highlighting for:
- Prohibited MCE keywords/statements (e.g., INSERT/UPDATE/DELETE) to warn users
- Unsupported MCE functions

All MCE-specific lists and behavior must align with:
`apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`

## Requirements Discussion

### First Round Questions

**Q1:** What are the concrete highlighting failures today?
**Answer:** Fields are not getting highlighted, tables are not getting highlighted, and some keywords such as `SELECT` and `FROM` are bolded but multi-word/join variants like `INNER JOIN` are not consistently bolded/highlighted.

**Q2:** Should we keep Monaco’s language id as `"sql"` and override tokenization, or register a new language id (e.g. `"mce-sql"`)?
**Answer:** User is unsure, with a preference for as little custom code as possible. Recommendation/decision: keep the language id as `"sql"` to reuse existing editor wiring (completion providers, language configuration) and apply a custom tokenizer for MCE-focused highlighting.

**Q3:** Should keyword highlighting be limited to MCE-supported keywords (per reference), or broader “standard SQL/T‑SQL” keywords too?
**Answer:** Only the supported keywords in the MCE SQL reference.

**Q4:** Confirm `CASE / WHEN / THEN / ELSE / END` should be treated as supported control flow highlighting (not prohibited).
**Answer:** Yes, treat these as supported control flow and highlight accordingly.

**Q5:** Strings vs quoted identifiers: should double quotes `"` be treated as string literals or identifiers?
**Answer:** Single quotes are string literals. Double quotes are identifiers (but bracketed identifiers are preferred when possible).

**Q6:** Should bracketed identifiers `[...]` be treated as identifiers so prohibited/unsupported keywords inside them are NOT highlighted?
**Answer:** Yes. Prefer identifier recognition and avoid highlighting invalid/prohibited keywords inside identifiers.

**Q7:** Prohibited keywords: should we include procedural words as prohibited/highlighted too?
**Answer:** Yes, include procedural words as well.

**Q8:** Unsupported functions: should they be highlighted as error-style tokens?
**Answer:** Yes, unsupported functions should be highlighted as error.

**Q9:** Data types: what set should be recognized/highlighted?
**Answer:** Recommendation: use a SQL Server–oriented type list and prefer context-aware highlighting (e.g., `CAST(... AS <type>)`, `CONVERT(<type>, ...)`) to reduce false positives.

**Q10:** Operators/punctuation: any special preferences?
**Answer:** Use standard operator/punctuation highlighting.

**Q11:** Styling: should prohibited/unsupported tokens use existing error/warning colors?
**Answer:** Use existing error/warning colors, but avoid reusing those same colors for normal syntax tokens to prevent visual ambiguity.

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
No visual insights available (no files provided).

## Requirements Summary

### Functional Requirements

- Implement MCE-focused SQL syntax highlighting for the Monaco editor.
- Keywords:
  - Highlight **only** MCE-supported keywords and clauses (per `MCE-SQL-REFERENCE.md`).
  - Ensure join variants are highlighted consistently (e.g., `INNER`, `LEFT`, `RIGHT`, `FULL`, `OUTER`, `CROSS`, `JOIN`).
  - Ensure multi-word keywords are handled (e.g., `GROUP BY`, `ORDER BY`, `UNION ALL`).
- Functions:
  - Highlight function names as functions.
  - Highlight unsupported functions (per `MCE-SQL-REFERENCE.md`) as **error-style** tokens.
- Prohibited keywords:
  - Highlight MCE-disallowed statements/keywords as **error-style** tokens (e.g., INSERT/UPDATE/DELETE/DDL/CTE/etc. per reference).
  - Include procedural keywords (DECLARE/SET/WHILE/IF/PRINT/TRY/CATCH/etc. per reference).
  - Do not highlight prohibited keywords inside identifiers, strings, or comments.
- Identifiers:
  - Treat bracketed identifiers `[...]` as identifiers (single token) so keyword highlighting does not occur within.
  - Treat double-quoted identifiers `\"...\"` as identifiers (single token).
  - Keep identifiers in a neutral style by default, with support for separate semantic styling for tables vs fields vs aliases (if needed to meet “tables/fields not highlighted” requirement).
- Tables and fields:
  - Ensure table references (FROM/JOIN targets) are visibly highlighted.
  - Ensure field references are visibly highlighted (at minimum in the SELECT list; extend as needed to cover common clauses like WHERE/ON/GROUP BY/ORDER BY).
- Core tokenization:
  - Strings: single quotes as string literals (support escaped single quotes `''`).
  - Comments: `--` line comments and `/* ... */` block comments.
  - Numbers: integers and decimals.
  - Operators/punctuation: standard SQL operators and punctuation should be tokenized (consistent with Monaco conventions).

### Implementation Constraints

- Prefer minimal custom wiring:
  - Keep Monaco language id as `"sql"` and provide custom tokenization for MCE highlighting.
- Ensure the highlighting source-of-truth aligns with `apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md` to prevent drift between linting and highlighting.

### Scope Boundaries

**In Scope:**
- Custom syntax highlighting/tokenization and theme token mapping for MCE SQL, including special error-style highlighting for prohibited keywords and unsupported functions.
- Fixing table/field highlighting visibility in the editor.

**Out of Scope:**
- Changes to query execution, query formatting/pretty-printing, or non-highlighting editor features.
