# Specification: SQL Autocomplete UX Redesign

## Goal

Overhaul the Monaco-based SQL autocomplete system to create a "magic-feeling" experience that assists without fighting the user's natural typing flow, with ghost text for deterministic structural patterns and dropdown for data completions.

## User Stories

- As a SQL author, I want the dropdown to only appear when I'm actively typing identifiers so that it doesn't interrupt my workflow when pressing space, enter, or comma.
- As a SQL author, I want ghost text suggestions for JOIN patterns and aliases so that I can accept common structures with a single Tab press.
- As a SQL author, I want ENT. shared tables to appear in autocomplete alongside local tables so that I can easily reference shared data extensions.

## Specific Requirements

**Fix Dropdown Trigger Characters**
- Remove space, newline, comma, and `)` from Monaco `triggerCharacters` array
- Change `quickSuggestions` from boolean `true` to structured config: `{ other: true, comments: false, strings: false }`
- Implement 2-character minimum threshold for general alphanumeric typing
- Implement 1-character minimum for immediate contexts: after `.`, `[`, and `_`
- Current triggers at line 253: `[" ", ".", "[", ",", ")"]` - reduce to `[".", "["]`

**Add Ghost Text Negative Conditions**
- Check cursor position to suppress ghost text inside string literals (single/double quotes)
- Check cursor position to suppress ghost text inside comments (`--` line or `/* */` block)
- Check cursor position to suppress ghost text inside brackets `[...]`
- Check cursor position to suppress ghost text after comparison operators (`=`, `<`, `>`, `!=`, etc.)
- Check cursor position to suppress ghost text inside function parentheses
- Check `SELECT LEFT|` pattern where LEFT/RIGHT could be functions, not JOIN keywords

**Fix Alias Ghost Text Inconsistency**
- Ensure alias suggestion rule fires reliably after table reference followed by space
- Generate smart aliases using existing `generateSmartAlias()` utility with collision avoidance
- Handle ENT. prefix tables correctly (use name after ENT. for alias generation)

**Implement SFMC Identity Field Matching for JOIN Conditions**
- Create constants file with `SFMC_IDENTITY_FIELDS` array (ContactID, SubscriberKey, etc.)
- Create regex patterns for case-insensitive identity field matching
- Match fields across tables even when differently named (ContactID = SubscriberKey)
- Provide exact matches first, then identity equivalences, then other Id/Key suffixes

**Improve Fuzzy Matching and Suggestion Ordering**
- Implement prefix matches first, CamelCase/underscore boundary matches second
- Prioritize common SFMC functions (DATEADD, CONVERT, COALESCE, etc.)
- Apply alphabetical sort within each priority tier
- Limit dropdown to MAX_SUGGESTIONS (10) items

**Investigate and Fix ENT. Table Bug**
- Determine root cause of ENT. tables only showing after `JOIN []` but not `FROM []`
- Current code at lines 340-397 handles `buildDataExtensionSuggestions` - verify ENT. tables included
- Flatten ENT. tables into main table list for consistent display
- Ensure fuzzy match works on full name including `ENT.` prefix

**Implement Asterisk Expansion Feature**
- On Ctrl+Space when cursor is on `*` in SELECT clause, expand to full column list
- Prefix columns with table alias if alias exists
- Show error when fields are ambiguous (multiple tables without aliases)
- Use bracket notation for column names containing spaces

**Verify Dismissal and Acceptance Behavior**
- Ensure Tab and Enter both accept the highlighted suggestion
- Verify comma and semicolon close dropdown and insert the character
- Verify Escape closes dropdown without inserting anything
- Verify auto-bracket insertion after FROM/JOIN keywords works per existing logic at lines 529-578

## Existing Code to Leverage

**Inline Suggestions Rule Engine**
- Located at `apps/web/src/features/editor-workspace/utils/inline-suggestions/rule-engine.ts`
- Clean pattern: rules array evaluated in priority order, first match wins
- Preserve this architecture - add new rules or modify existing ones to add negative conditions
- Existing rules: `joinKeywordRule` (priority 100), `aliasSuggestionRule` (80), `onKeywordRule` (70), `joinConditionRule` (60)

**SQL Context Parser**
- Located at `apps/web/src/features/editor-workspace/utils/sql-context.ts`
- `tokenizeSql()` handles comments, strings, brackets, and subqueries robustly
- `getSqlCursorContext()` provides cursor depth, current word, alias detection, and table scope
- Extend to detect negative conditions (inside string, inside comment, inside function parens)

**Alias Generator Utility**
- Located at `apps/web/src/features/editor-workspace/utils/alias-generator.ts`
- `generateSmartAlias()` extracts initials from CamelCase/underscore names with collision avoidance
- Reuse directly for alias ghost text suggestions

**SQL Linter Modular Structure**
- Located at `apps/web/src/features/editor-workspace/utils/sql-lint/`
- Model for organizing autocomplete constants and utilities into separate files
- `utils/helpers.ts` pattern for shared utilities

**Monaco Editor Options**
- Located at `apps/web/src/features/editor-workspace/utils/monaco-options.ts`
- `getEditorOptions()` currently sets `quickSuggestions: true` at line 31
- Change to structured object config for finer control

## Out of Scope

- Data-dependent ghost text (only deterministic/structural patterns)
- New SQL functions beyond those already supported in SFMC
- Changes to the SQL linter system (except coordination with autocomplete)
- Backend or API changes
- INSERT, UPDATE, DELETE, or DDL statement support
- CTE (WITH clause) support - SFMC does not support CTEs
- Semicolon statement terminator support
- Multi-statement query support
- Dark mode or theme changes to autocomplete dropdown styling
- Performance optimizations for large table lists (defer to future spec)
