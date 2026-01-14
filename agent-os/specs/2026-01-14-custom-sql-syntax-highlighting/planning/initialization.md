# Feature Initialization

## Raw Idea

Fix SQL syntax highlighting in the QS Pro Monaco query editor by implementing custom MCE-focused SQL highlighting (instead of relying on Monaco’s built-in `sql` language).

### Core Highlighting Elements

1. Keywords - SQL commands: SELECT, FROM, WHERE, JOIN, GROUP BY, ORDER BY, etc.
2. Functions - Built-in functions: ROW_NUMBER(), UPPER(), COUNT(), AVG(), etc.
3. Data Types - VARCHAR, INT, DATE, FLOAT, BOOLEAN, etc.
4. Strings - Single-quoted and double-quoted string literals
5. Numbers - Numeric literals (integers, decimals)
6. Comments - Single-line (--) and block comments (/* */)
7. Operators - Logical operators (AND, OR, NOT), comparison operators (=, <>, <, >), arithmetic operators (+, -, *, /)
8. Special Characters - Parentheses, commas, semicolons, periods (for qualified names)

### Additional Considerations

- Identifiers - Table names, column names, aliases (neutral color)
- Active Words - CASE, WHEN, THEN, ELSE (control flow)
- Special Keywords - NULL, TRUE, FALSE

### MCE-Specific Context

For Salesforce Marketing Cloud Engagement SQL:
- Prohibited Keywords - highlight MCE-disallowed statements/keywords (INSERT, UPDATE, DELETE, etc.) differently as a warning
- Unsupported Functions - highlight functions that aren’t supported by MCE (per reference) differently

### Reference

All keyword/function support and “prohibited/unsupported” lists must align with:
`apps/web/src/features/editor-workspace/utils/sql-lint/MCE-SQL-REFERENCE.md`
