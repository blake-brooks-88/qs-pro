# Spec Requirements: SQL Autocomplete UX Redesign

## Initial Description

A comprehensive overhaul of the Monaco-based SQL autocomplete system for QS Pro. The goal is to create a "magic-feeling" autocomplete experience that assists without fighting the user's natural typing flow.

### Core Problems to Solve
1. Ghost text appears too aggressively (incorrect JOINs, wrong contexts)
2. Dropdown triggers on spaces, newlines, and non-alphanumeric characters
3. Inconsistent suggestion behavior (appears when unwanted, absent when needed)
4. ENT. tables only showing after `JOIN []` (bug)
5. Alias ghost text not consistently appearing

### Design Philosophy
- **Ghost text** = structural patterns (deterministic, high-confidence)
- **Dropdown** = data completions (tables, columns, functions)
- **Never overlap** - they serve different purposes

---

## Requirements Discussion

### First Round Questions

**Q1:** The PRD mentions 6 implementation phases. I'm assuming we want to tackle all phases as a single cohesive spec, with Phase 1 (Fix Triggers) being the highest priority. Is that correct, or would you prefer to break this into separate specs per phase?
**Answer:** Yes, all in one spec.

**Q2:** The PRD lists 80+ comprehensive interaction scenarios (Categories 1-10). I assume these serve as acceptance criteria for testing. Should we treat these as the authoritative test cases, or do you expect to add/modify scenarios during implementation?
**Answer:** Yes, they describe the desired behavior.

**Q3:** For the auto-bracket insertion behavior (`FROM [` with auto-delete `]` on backspace), I assume this is Monaco's `autoClosingBrackets` feature being extended. Is there existing custom bracket handling code, or should we implement this from scratch?
**Answer:** Yes, this should exist, but make sure it's working per the PRD.

**Q4:** The PRD defines `GHOST_TEXT_DEBOUNCE.dataDependant: 175ms` for "If we ever add data-dependent ghost text." I assume we're NOT implementing data-dependent ghost text in this spec (keeping ghost text purely structural/deterministic). Is that correct?
**Answer:** Yes, deterministic only.

**Q5:** For the `*` expansion feature (Ctrl+Space on asterisk to expand columns), what should happen when there are multiple tables in scope without aliases? For example: `SELECT * FROM [A], [B]` - should it prefix columns with table names, or show an error/warning?
**Answer:** It should show an error. We need errors to show when fields are ambiguous.

**Q6:** The ENT. table bug is mentioned ("only showing after `JOIN []`"). Do you have insight into the root cause, or should we investigate and document findings as part of this spec?
**Answer:** We need to investigate as a part of this fix.

**Q7:** I assume we should preserve the existing autocomplete infrastructure and make targeted fixes rather than a complete rewrite of the autocomplete system. Is that accurate, or is a rewrite acceptable if needed?
**Answer:** Rewrite is acceptable if it's more KISS, DRY, SOLID, easier to test/change.

---

### Existing Code to Reference

**Similar Features Identified:**

#### Core Autocomplete Implementation
- **MonacoQueryEditor:** `apps/web/src/features/editor-workspace/components/MonacoQueryEditor.tsx`
  - `CompletionItemProvider` registration (lines 251-446)
  - `InlineCompletionsProvider` registration (lines 448-512)
  - Auto-bracket insertion handler (lines 529-578)
  - Current trigger characters: `[" ", ".", "[", ",", ")"]` (line 253)

#### SQL Parsing & Context
- **SQL Context Parser:** `apps/web/src/features/editor-workspace/utils/sql-context.ts`
  - `tokenizeSql()`: SQL tokenizer
  - `getSqlCursorContext()`: Cursor context analysis
  - `extractTableReferences()`: Table/alias extraction
  - `extractSelectFieldRanges()`: SELECT field parsing

#### Suggestion Builders
- **Autocomplete Suggestions:** `apps/web/src/features/editor-workspace/utils/sql-autocomplete.ts`
  - `buildDataExtensionSuggestions()`: DE fuzzy matching
  - `buildFieldSuggestions()`: Field completion formatting
  - `fuzzyMatch()`: Fuzzy matching algorithm
  - `resolveTableForAlias()`: Alias resolution

- **Contextual Keywords:** `apps/web/src/features/editor-workspace/utils/autocomplete-keyword.ts`
  - `getContextualKeywords()`: Priority keyword mapping by context

#### Inline Suggestions (Ghost Text) System
- **Rule Engine:** `apps/web/src/features/editor-workspace/utils/inline-suggestions/rule-engine.ts`
  - `evaluateInlineSuggestions()`: Main evaluation function
  - Priority-ordered rule execution

- **Individual Rules:**
  - `rules/join-keyword-rule.ts`: INNER/LEFT/RIGHT → " JOIN" (Priority 100)
  - `rules/alias-suggestion-rule.ts`: table → " AS alias" (Priority 80)
  - `rules/on-keyword-rule.ts`: alias → " ON " (Priority 70)
  - `rules/join-condition-rule.ts`: ON → field conditions (Priority 60)

- **Types:** `apps/web/src/features/editor-workspace/utils/inline-suggestions/types.ts`
  - `InlineSuggestionContext`, `InlineSuggestionRule`, `InlineSuggestion`

#### Supporting Utilities
- **Alias Generator:** `apps/web/src/features/editor-workspace/utils/alias-generator.ts`
  - `generateSmartAlias()`: CamelCase/underscore alias extraction

- **Monaco Options:** `apps/web/src/features/editor-workspace/utils/monaco-options.ts`
  - `getEditorOptions()`: Editor configuration (currently `quickSuggestions: true`)

#### SQL Linter (Related)
- **Linter Infrastructure:** `apps/web/src/features/editor-workspace/utils/sql-lint/`
  - Modular rule-based linting system
  - Tokenizer utilities (`utils/tokenizer.ts`)
  - Helper functions (`utils/helpers.ts`)

---

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
N/A - The PRD (`docs/plans/2025-01-08-sql-autocomplete-ux-redesign.md`) contains comprehensive textual specifications including:
- 80+ interaction scenarios across 10 categories
- Detailed trigger rules tables
- Configuration constants with exact values

---

## Requirements Summary

### Functional Requirements

#### Phase 1: Fix Triggers (Highest Priority)
- Remove space from `triggerCharacters`
- Remove newline/Enter from triggers
- Remove comma from triggers
- Remove `)` from triggers
- Set `quickSuggestions` to custom config (not boolean `true`)
- Implement 2-char minimum for general typing
- Implement 1-char minimum for `.`, `[`, `_` contexts

#### Phase 2: Fix Ghost Text
- Add negative condition checks:
  - Inside string literals
  - Inside comments
  - Inside brackets
  - After comparison operators
  - Inside function parentheses
  - After SELECT before FROM (for LEFT/RIGHT which could be functions)
- Fix alias suggestion inconsistency
- Verify JOIN keyword ghost text only fires at clause level

#### Phase 3: Suggestion Ordering
- Create `SFMC_IDENTITY_FIELDS` constant with identity field patterns
- Implement identity field equivalence matching for JOIN conditions
- Implement fuzzy matching priority: prefix → CamelCase → alphabetical
- Prioritize common SFMC functions

#### Phase 4: ENT. Table Handling
- Investigate root cause of ENT. tables only showing after `JOIN []`
- Flatten ENT. tables into main table list
- Ensure fuzzy match works on full name including `ENT.` prefix

#### Phase 5: Special Features
- Implement `*` expansion (Ctrl+Space on asterisk)
  - Show error when fields are ambiguous (multiple tables without aliases)
- Verify auto-insert behaviors:
  - Space after keywords
  - `(` after functions
  - `[` after FROM/JOIN

#### Phase 6: Dismissal & Acceptance
- Verify Tab and Enter both accept
- Implement comma/semicolon dismissal
- Verify Escape closes dropdown

### Reusability Opportunities

#### Existing Infrastructure to Leverage
- **Rule Engine Pattern:** The inline suggestions system (`rule-engine.ts`) uses a clean, extensible rule pattern that should be preserved
- **Tokenizer:** `tokenizeSql()` is robust and handles comments, strings, brackets, and subqueries
- **Alias Generator:** `generateSmartAlias()` already handles collision avoidance
- **Linter Pattern:** The modular `sql-lint/` structure provides a model for organizing autocomplete rules

#### Components That May Need Rewrite
- **CompletionItemProvider:** Currently in MonacoQueryEditor.tsx (195 lines) - may benefit from extraction to separate module
- **Trigger Configuration:** Currently hardcoded, should move to constants file per PRD
- **quickSuggestions Configuration:** Currently boolean `true`, needs structured config

### Scope Boundaries

**In Scope:**
- All 6 phases from the PRD
- 80+ interaction scenarios as acceptance criteria
- Configuration constants as defined in PRD
- ENT. table bug investigation and fix
- `*` expansion feature with ambiguity error handling
- Potential rewrite if it improves KISS/DRY/SOLID/testability

**Out of Scope:**
- Data-dependent ghost text (only deterministic/structural)
- New SQL functions beyond those in SFMC SQL Constraints
- Changes to the linter system (except coordination)
- Backend/API changes

### Technical Considerations

#### Monaco Editor Configuration
- `quickSuggestions` must change from `true` to structured config:
  ```typescript
  quickSuggestions: {
    other: true,
    comments: false,
    strings: false
  }
  ```
- Trigger characters must be reduced: Remove space, newline, comma, `)`
- May need `suggestOnTriggerCharacters: true` with custom logic

#### Testing Strategy
- Unit tests for each inline suggestion rule
- Unit tests for trigger character logic
- Unit tests for fuzzy matching
- Integration tests for the 80+ interaction scenarios
- Tests should be easy to add/modify per the extensible rule pattern

#### Constants File Structure (Per PRD)
```typescript
// src/features/editor-workspace/constants/autocomplete-config.ts
export const SFMC_IDENTITY_FIELDS = [...];
export const IDENTITY_FIELD_PATTERNS = [...];
export const IMMEDIATE_TRIGGER_CHARS = ['.', '[', '_'];
export const MIN_TRIGGER_CHARS = 2;
export const MAX_SUGGESTIONS = 10;
export const GHOST_TEXT_DEBOUNCE = { structural: 0, dataDependant: 175 };
export const DROPDOWN_CLOSE_CHARS = [',', ';', ')', '\n'];
export const NO_TRIGGER_CHARS = [' ', '\n', '\r', ',', ';', ')', '-'];
```

#### Architecture Considerations
- Consider extracting CompletionItemProvider to its own module for testability
- Consider extracting InlineCompletionsProvider to its own module
- Maintain the rule-based pattern for inline suggestions
- Ensure negative conditions (strings, comments, etc.) are checked consistently across both dropdown and ghost text
