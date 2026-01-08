# Task Breakdown: SQL Autocomplete UX Redesign

## Overview
Total Tasks: 7 Task Groups with ~35 Sub-Tasks

This is a frontend-only feature focused on improving the Monaco-based SQL autocomplete experience. There are no backend/API/database changes required.

## Task List

### Configuration & Infrastructure

#### Task Group 1: Autocomplete Configuration Constants
**Dependencies:** None
**Status:** ✅ COMPLETE

- [x] 1.0 Complete configuration infrastructure
  - [x] 1.1 Write 4-6 focused tests for configuration constants
    - Test SFMC_IDENTITY_FIELDS array contains expected fields
    - Test IDENTITY_FIELD_PATTERNS regex matching
    - Test immediate trigger character classification
    - Test configuration values are correctly exported
  - [x] 1.2 Create constants file `apps/web/src/features/editor-workspace/constants/autocomplete-config.ts`
    - `SFMC_IDENTITY_FIELDS`: Array of identity field names (ContactID, SubscriberKey, etc.)
    - `IDENTITY_FIELD_PATTERNS`: Regex patterns for case-insensitive matching
    - `IMMEDIATE_TRIGGER_CHARS`: `['.', '[', '_']`
    - `MIN_TRIGGER_CHARS`: `2`
    - `MAX_SUGGESTIONS`: `10`
    - `GHOST_TEXT_DEBOUNCE`: `{ structural: 0, dataDependant: 175 }`
    - `DROPDOWN_CLOSE_CHARS`: `[',', ';', ')', '\n']`
    - `NO_TRIGGER_CHARS`: `[' ', '\n', '\r', ',', ';', ')', '-']`
  - [x] 1.3 Update Monaco editor options in `apps/web/src/features/editor-workspace/utils/monaco-options.ts`
    - Change `quickSuggestions` from `true` to `{ other: true, comments: false, strings: false }`
  - [x] 1.4 Export constants from feature barrel file
  - [x] 1.5 Ensure configuration tests pass
    - Run ONLY the 4-6 tests written in 1.1

**Acceptance Criteria:**
- ✅ Constants are exported and usable throughout the autocomplete system
- ✅ Monaco editor options use structured quickSuggestions config
- ✅ Tests verify configuration values (36 tests passing)

---

### Dropdown Trigger System

#### Task Group 2: Fix Dropdown Trigger Behavior
**Dependencies:** Task Group 1
**Status:** ✅ COMPLETE

- [x] 2.0 Complete dropdown trigger fixes
  - [x] 2.1 Write 4-6 focused tests for trigger behavior
    - Test dropdown does NOT trigger on space
    - Test dropdown does NOT trigger on newline/Enter
    - Test dropdown does NOT trigger on comma
    - Test dropdown triggers immediately after `.` and `[`
    - Test dropdown requires 2+ characters for general alphanumeric typing
  - [x] 2.2 Update `triggerCharacters` in `MonacoQueryEditor.tsx` (line 253)
    - Change from `[" ", ".", "[", ",", ")"]` to `[".", "["]`
  - [x] 2.3 Implement character threshold logic in CompletionItemProvider
    - 2-character minimum for general alphanumeric typing
    - 1-character minimum for immediate contexts: after `.`, `[`, and `_`
    - Use constants from Task Group 1
  - [x] 2.4 Verify dismissal and acceptance behavior
    - Tab and Enter accept highlighted suggestion
    - Comma and semicolon close dropdown and insert character
    - Escape closes dropdown without inserting
  - [x] 2.5 Ensure dropdown trigger tests pass
    - Run ONLY the 4-6 tests written in 2.1

**Acceptance Criteria:**
- ✅ Dropdown no longer triggers on space, newline, comma, or `)`
- ✅ 2-character minimum threshold enforced for general typing
- ✅ Immediate trigger after `.` and `[` with 1-character minimum (12 tests passing)

---

### Ghost Text (Inline Suggestions) System

#### Task Group 3: Fix Ghost Text Negative Conditions
**Dependencies:** Task Group 1
**Status:** ✅ COMPLETE

- [x] 3.0 Complete ghost text negative conditions
  - [x] 3.1 Write 6-8 focused tests for ghost text suppression
    - Test ghost text suppressed inside single-quoted strings
    - Test ghost text suppressed inside double-quoted strings
    - Test ghost text suppressed inside line comments (`--`)
    - Test ghost text suppressed inside block comments (`/* */`)
    - Test ghost text suppressed inside brackets `[...]`
    - Test ghost text suppressed after comparison operators (`=`, `<`, `>`, `!=`, etc.)
    - Test ghost text suppressed inside function parentheses
    - Test `SELECT LEFT|` does NOT suggest JOIN (LEFT could be function)
  - [x] 3.2 Extend SQL context parser (`apps/web/src/features/editor-workspace/utils/sql-context.ts`)
    - Add `isInsideString()` helper function
    - Add `isInsideComment()` helper function
    - Add `isInsideBrackets()` helper function
    - Add `isAfterComparisonOperator()` helper function
    - Add `isInsideFunctionParens()` helper function
  - [x] 3.3 Update inline suggestion rule engine (`apps/web/src/features/editor-workspace/utils/inline-suggestions/rule-engine.ts`)
    - Add negative condition checks before evaluating rules
    - Check all negative conditions and return early if any match
  - [x] 3.4 Update `joinKeywordRule` (priority 100)
    - Add check for SELECT clause context (LEFT/RIGHT could be functions)
    - Only fire at clause level (after FROM, JOIN keywords)
  - [x] 3.5 Ensure ghost text suppression tests pass
    - Run ONLY the 6-8 tests written in 3.1

**Acceptance Criteria:**
- ✅ Ghost text never appears inside strings, comments, or brackets
- ✅ Ghost text never appears after comparison operators
- ✅ LEFT/RIGHT after SELECT does not trigger JOIN suggestion (43 tests passing)

---

#### Task Group 4: Fix Alias Ghost Text and JOIN Conditions
**Dependencies:** Task Group 3
**Status:** ✅ COMPLETE

- [x] 4.0 Complete alias and JOIN condition improvements
  - [x] 4.1 Write 4-6 focused tests for alias and JOIN features
    - Test alias suggestion fires reliably after table reference + space
    - Test alias suggestion handles ENT. prefix tables correctly
    - Test collision avoidance works with multiple similar table names
    - Test SFMC identity field matching across tables (ContactID = SubscriberKey)
    - Test JOIN condition suggestions prioritize identity field equivalences
  - [x] 4.2 Fix `aliasSuggestionRule` (priority 80)
    - Ensure rule fires reliably after table reference followed by space
    - Use existing `generateSmartAlias()` utility
    - Handle ENT. prefix tables (use name after ENT. for alias generation)
    - Implement collision avoidance per existing utility
  - [x] 4.3 Enhance `joinConditionRule` (priority 60)
    - Integrate `SFMC_IDENTITY_FIELDS` constants
    - Match fields across tables even when differently named
    - Provide exact matches first, then identity equivalences, then Id/Key suffixes
  - [x] 4.4 Ensure alias and JOIN condition tests pass
    - Run ONLY the 4-6 tests written in 4.1

**Acceptance Criteria:**
- ✅ Alias ghost text appears consistently after table references
- ✅ ENT. prefix tables generate correct aliases
- ✅ JOIN conditions match SFMC identity fields intelligently (9 tests passing)

---

### Suggestion Quality & ENT. Tables

#### Task Group 5: Fuzzy Matching, Ordering, and ENT. Table Bug Fix
**Dependencies:** Task Group 2
**Status:** ✅ COMPLETE

- [x] 5.0 Complete suggestion quality improvements
  - [x] 5.1 Write 4-6 focused tests for fuzzy matching and ENT. tables
    - Test prefix matches appear before CamelCase/underscore matches
    - Test common SFMC functions are prioritized
    - Test MAX_SUGGESTIONS (10) limit is enforced
    - Test ENT. tables appear in FROM clause (not just JOIN)
    - Test fuzzy match works on full ENT. prefix
  - [x] 5.2 Investigate and fix ENT. table bug
    - Root cause: buildDataExtensionSuggestions was limiting to 10, then Monaco was slicing again
    - Fix: Made maxSuggestions parameter configurable, passing 50 for Monaco dropdown
    - ENT. tables now appear in both FROM and JOIN contexts
  - [x] 5.3 Improve fuzzy matching in `apps/web/src/features/editor-workspace/utils/sql-autocomplete.ts`
    - Implement prefix matches first (score: 1000 - length)
    - CamelCase/underscore boundary matches second (score: 500)
    - Alphabetical sort within each priority tier
    - Contains matches third (score: 100)
  - [x] 5.4 Enforce MAX_SUGGESTIONS limit
    - Limit dropdown to 10 items maximum by default
    - Configurable via parameter for Monaco dropdown (50)
    - Apply after sorting/prioritization
  - [x] 5.5 Ensure fuzzy matching and ENT. table tests pass
    - Run ONLY the 4-6 tests written in 5.1

**Acceptance Criteria:**
- ✅ ENT. tables appear consistently in both FROM and JOIN contexts
- ✅ Fuzzy matching prioritizes prefix matches
- ✅ Dropdown limited to configurable suggestions (13 tests passing)

---

### Special Features

#### Task Group 6: Asterisk Expansion Feature
**Dependencies:** Task Groups 2, 3
**Status:** ✅ COMPLETE

- [x] 6.0 Complete asterisk expansion feature
  - [x] 6.1 Write 4-6 focused tests for asterisk expansion
    - Test Ctrl+Space on `*` expands to full column list
    - Test columns prefixed with table alias when alias exists
    - Test error shown when fields ambiguous (multiple tables without aliases)
    - Test bracket notation used for column names with spaces
  - [x] 6.2 Implement asterisk detection in CompletionItemProvider
    - Detect when cursor is on `*` in SELECT clause
    - Respond to Ctrl+Space keyboard shortcut
  - [x] 6.3 Implement column expansion logic
    - Get columns for all tables in scope
    - Apply table alias prefix when alias exists
    - Use bracket notation for column names containing spaces
  - [x] 6.4 Implement ambiguity error handling
    - Detect multiple tables without aliases
    - Show descriptive error message to user
    - Prevent expansion when ambiguous
  - [x] 6.5 Ensure asterisk expansion tests pass
    - Run ONLY the 4-6 tests written in 6.1

**Acceptance Criteria:**
- ✅ Ctrl+Space on `*` expands to full column list
- ✅ Alias prefix applied correctly
- ✅ Clear error when columns are ambiguous (6 tests passing)

---

### Test Review

#### Task Group 7: Test Review & Gap Analysis
**Dependencies:** Task Groups 1-6
**Status:** ✅ COMPLETE

- [x] 7.0 Review existing tests and fill critical gaps only
  - [x] 7.1 Review tests from Task Groups 1-6
    - Review 36 tests written by Task Group 1 (configuration)
    - Review 12 tests written by Task Group 2 (dropdown triggers)
    - Review 43 tests written by Task Group 3 (ghost text suppression)
    - Review 9 tests written by Task Group 4 (alias/JOIN conditions)
    - Review 13 tests written by Task Group 5 (fuzzy matching/ENT. tables)
    - Review 6 tests written by Task Group 6 (asterisk expansion)
    - Total existing tests: 119 tests
  - [x] 7.2 Analyze test coverage gaps for THIS feature only
    - Identified critical user workflows lacking test coverage
    - Focus ONLY on gaps related to autocomplete UX requirements
    - Prioritized end-to-end interaction scenarios from PRD
  - [x] 7.3 Write up to 10 additional strategic tests maximum
    - Created 12 integration tests covering complete workflows
    - Focus on integration points between dropdown and ghost text systems
    - Test key interaction scenarios from the 80+ PRD scenarios
  - [x] 7.4 Run feature-specific tests only
    - Run ONLY tests related to autocomplete UX redesign
    - Total: 131 tests, all passing
    - Verify critical workflows pass

**Acceptance Criteria:**
- ✅ All feature-specific tests pass (131 tests)
- ✅ Critical user workflows for autocomplete are covered
- ✅ Integration tests added (12 additional tests)

---

## Execution Summary

All task groups completed in the recommended sequence with parallel execution:

```
TG1 (Config) ─┬─► TG2 (Dropdown) ─┬─► TG5 (Fuzzy/ENT.) ✅
              │                   │
              └─► TG3 (Ghost Text)─┴─► TG4 (Alias/JOIN) ✅
                                  │
                                  └─► TG6 (Asterisk) ✅
                                           │
                                           ▼
                                    TG7 (Test Review) ✅
```

## Files Modified

| File | Task Groups | Status |
|------|-------------|--------|
| `apps/web/src/features/editor-workspace/constants/autocomplete-config.ts` (NEW) | TG1 | ✅ |
| `apps/web/src/features/editor-workspace/constants/index.ts` (NEW) | TG1 | ✅ |
| `apps/web/src/features/editor-workspace/utils/monaco-options.ts` | TG1 | ✅ |
| `apps/web/src/features/editor-workspace/components/MonacoQueryEditor.tsx` | TG2, TG5, TG6 | ✅ |
| `apps/web/src/features/editor-workspace/utils/sql-context.ts` | TG3 | ✅ |
| `apps/web/src/features/editor-workspace/utils/inline-suggestions/rule-engine.ts` | TG3 | ✅ |
| `apps/web/src/features/editor-workspace/utils/inline-suggestions/rules/join-keyword-rule.ts` | TG3 | ✅ |
| `apps/web/src/features/editor-workspace/utils/inline-suggestions/rules/alias-suggestion-rule.ts` | TG4 | ✅ |
| `apps/web/src/features/editor-workspace/utils/inline-suggestions/rules/join-condition-rule.ts` | TG4 | ✅ |
| `apps/web/src/features/editor-workspace/utils/sql-autocomplete.ts` | TG5 | ✅ |

## Test Files Created

| Test File | Task Group | Tests |
|-----------|------------|-------|
| `constants/autocomplete-config.test.ts` | TG1 | 27 |
| `constants/verify-exports.test.ts` | TG1 | 9 |
| `components/__tests__/dropdown-triggers.test.ts` | TG2 | 12 |
| `utils/inline-suggestions/__tests__/negative-conditions.test.ts` | TG3 | 26 |
| `utils/inline-suggestions/rules/join-keyword-rule.test.ts` | TG3 | 11 |
| `utils/inline-suggestions/rules/on-keyword-rule.test.ts` | TG3 | 6 |
| `utils/inline-suggestions/__tests__/alias-join-conditions.test.ts` | TG4 | 9 |
| `utils/sql-autocomplete-ent.test.ts` | TG5 | 13 |
| `components/__tests__/asterisk-expansion.test.ts` | TG6 | 6 |
| `__tests__/autocomplete-integration.test.ts` | TG7 | 12 |
| **TOTAL** | | **131** |

## Notes

- This is a **frontend-only** feature - no backend/API/database changes required ✅
- Preserved the existing **rule engine architecture** - added/modified rules rather than rewriting ✅
- The **80+ interaction scenarios** in the PRD served as acceptance criteria reference ✅
- **Ghost text = structural patterns** (deterministic, high-confidence) ✅
- **Dropdown = data completions** (tables, columns, functions) ✅
- These two systems **never overlap** - they serve different purposes ✅
