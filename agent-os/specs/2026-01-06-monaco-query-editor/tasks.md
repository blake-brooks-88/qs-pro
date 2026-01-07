# Task Breakdown: Monaco Query Editor

## Overview
Total Tasks: 4

## Task List

### Frontend Editor Foundation

#### Task Group 1: Monaco Editor Integration
**Dependencies:** None

- [x] 1.0 Complete editor foundation
  - [x] 1.1 Write 2-6 focused tests for the editor wrapper/config
    - Cover Monaco options (no minimap, ruler at 100, line numbers)
    - Cover content sync and onChange wiring to active tab
  - [x] 1.2 Add a Monaco-based editor component in `apps/web/src/features/editor-workspace/components/`
    - Props: value, onChange, diagnostics/markers, and completion providers
    - Replace the contentEditable editor in `apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx`
  - [x] 1.3 Configure Monaco editor options
    - Auto-pairs for quotes/brackets/parentheses/braces
    - Code folding, smart indent, find/replace
    - VS Code-style keybindings for common actions
    - Vertical ruler at 100 columns
  - [x] 1.4 Preserve existing toolbar and tab behaviors
    - Save shortcut, dirty state updates, and active tab content
  - [x] 1.5 Ensure editor foundation tests pass
    - Run ONLY the tests created in 1.1

**Acceptance Criteria:**
- Monaco replaces the placeholder editor
- Required editor behaviors are enabled and minimap is off
- Existing layout and tab flows still work
- Tests from 1.1 pass

### Frontend Intelligence

#### Task Group 2: Autocomplete and Metadata Integration
**Dependencies:** Task Group 1

- [x] 2.0 Complete autocomplete features
  - [x] 2.1 Write 3-8 focused tests for autocomplete logic
    - FROM/JOIN triggers DE suggestions
    - ENT.[DEName] insertion for shared DEs
    - Bracket insertion on select/click
    - Alias + '.' field suggestions
    - Alphabetical ordering and fuzzy match behavior
  - [x] 2.2 Build SQL context utilities
    - Detect FROM/JOIN/SELECT positions
    - Track table aliases and subquery scopes
    - Identify DE tokens for field lookup
  - [x] 2.3 Implement Monaco completion provider for Data Extensions
    - Use metadata cache from `apps/web/src/features/editor-workspace/hooks/use-metadata.ts`
    - Alphabetical results and fuzzy matching
    - Insert ENT.[DEName] for shared/parent BU
  - [x] 2.4 Implement field completion provider
    - Load fields on demand via existing metadata fields endpoint
    - Show `FieldName - DataType` in suggestions
    - Respect alias scoping, including subqueries
  - [x] 2.5 Add bracket guidance behavior
    - Auto-insert `[]` after typing SELECT or JOIN
  - [x] 2.6 Ensure autocomplete tests pass
    - Run ONLY the tests created in 2.1

**Acceptance Criteria:**
- DE and field autocomplete behaves as specified
- ENT prefix and bracket insertion are correct
- Subquery scoping is respected
- Tests from 2.1 pass

### Frontend Guardrails

#### Task Group 3: Linting, Diagnostics, and Run Gating
**Dependencies:** Task Groups 1-2

- [x] 3.0 Complete guardrails and diagnostics
  - [x] 3.1 Write 2-8 focused tests for lint rules and gating
    - Prohibited keywords, CTEs, temp tables
    - Procedural SQL bans
    - DE name spacing warnings
    - Whole-word matching to avoid DE false positives
  - [x] 3.2 Implement linter utility
    - Produce error/warning diagnostics with line/segment detail
    - Block on any MCE-failing construct
  - [x] 3.3 Connect diagnostics to Monaco
    - Red squiggles for errors, yellow for warnings
    - Tooltip/hover text for each diagnostic
  - [x] 3.4 Gate RUN button based on lint status
    - Disable RUN or show blocking modal
    - Ensure tooltips highlight specific failure points
  - [x] 3.5 Ensure guardrail tests pass
    - Run ONLY the tests created in 3.1

**Acceptance Criteria:**
- All invalid SQL patterns are blocked before running
- Diagnostics render with correct severity and tooltips
- RUN is blocked until lint is clean
- Tests from 3.1 pass

### Testing

#### Task Group 4: Test Review & Gap Analysis
**Dependencies:** Task Groups 1-3

- [x] 4.0 Review and fill critical test gaps
  - [x] 4.1 Review tests written in 1.1, 2.1, and 3.1
  - [x] 4.2 Identify missing coverage for critical editor workflows
  - [x] 4.3 Add up to 6 additional tests if necessary
  - [x] 4.4 Run feature-specific tests only
    - Run ONLY tests related to this feature

**Acceptance Criteria:**
- Feature-specific tests pass
- Critical workflows are covered without excessive test count
