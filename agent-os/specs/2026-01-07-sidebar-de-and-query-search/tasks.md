# Task Breakdown: Sidebar Search (DEs and Queries)

## Overview
Total Tasks: 4

## Task List

### Frontend: Metadata + Utilities

#### Task Group 1: Folder Path & Ancestor Resolution
**Dependencies:** None

- [x] 1.0 Implement metadata utilities for search
  - [x] 1.1 Write 2-8 focused tests for folder ancestor/path resolution
    - Cover: root handling (`null`/`0`), parent chain resolution, missing-parent behavior
    - Keep scope to deterministic helpers (no component rendering)
  - [x] 1.2 Implement helper(s) to compute:
    - Folder ancestor chain from a `Folder[]` + `folderId`
    - A displayable folder path string for search results
  - [x] 1.3 Validate metadata assumptions in current mapping
    - Confirm `CategoryID` is mapped to DE `folderId`
    - Confirm folders include parent pointers sufficient for ancestor chain
- [x] **Confirm folder retrieval is “full tree” (single call) and cached** <!-- id: 1 -->
    - **Context:** Research indicates SFMC `DataFolder` retrieval is limited to 2500 items per batch. Large orgs may exceed this.
    - **Strategy:** Implement `Do...While` pagination using `OverallStatus` and `ContinueRequest` to fetch *all* folders upfront.
    - **Justification:** "Zen Mode" requires instant searching and expansion. Lazy-loading introduces latency and complexity for deep searches.
    - [x] **Research:** Confirm retrieval limits and pagination strategy via documentation/search.
    - [x] **Implementation:**
        - Update `MetadataService.fetchFolders` to loop until `OverallStatus != 'MoreDataAvailable'`.
        - Implement safety cap (e.g., 50 pages) to prevent infinite loops.
        - Ensure `dedupeFolders` handles potential overlap correctly.
    - [x] **Verification:**
        - Verify `GET /api/metadata/folders` returns the complete hierarchy.
        - Validate that paginated requests are correctly formed (via logs or mock).
  - [x] 1.5 Ensure Task Group 1 tests pass
    - Run ONLY the 2-8 tests written in 1.1

**Acceptance Criteria:**
- Ancestor chain + folder path helpers are covered by 2-8 tests and pass
- Folder ancestry resolution works with shared + local folder sets

### Frontend: UI Components

#### Task Group 2: Reusable Sidebar Search (CVA)
**Dependencies:** Task Group 1

- [x] 2.0 Build reusable search UI component
  - [x] 2.1 Write 2-8 focused tests for the search UI behavior
    - Keyboard navigation: ArrowUp/ArrowDown, Enter (confirm only with explicit selection), Escape
    - Basic a11y: input labeling, focus visible, active option semantics
  - [x] 2.2 Create a “dumb” CVA-based component for sidebar search
    - Variants for sidebar density/layout (e.g., compact/dense)
    - Slots/props for results rendering and active item management
    - Solar icons for search + clear
  - [x] 2.3 Implement results popover container behavior
    - Open/close rules (typing opens; Escape closes; click outside closes)
    - No tree filtering occurs from typing; only from confirm callback
  - [x] 2.4 Ensure Task Group 2 tests pass
    - Run ONLY the 2-8 tests written in 2.1

**Acceptance Criteria:**
- Search component is reusable via variants and does not embed DE/Query-specific logic
- Full keyboard interaction works, and Enter requires explicit selection when multiple results exist
- Solar icons used for search UI

### Frontend: Feature Integration

#### Task Group 3: Workspace Sidebar Search + DE Focus Filter
**Dependencies:** Task Groups 1-2

- [x] 3.0 Integrate search into `WorkspaceSidebar`
  - [x] 3.1 Write 2-8 focused tests for the end-to-end sidebar search workflow
    - DE tab: typing shows results; confirming selection applies filter; clearing restores previous expand state
    - Queries tab: typing filters the available query list (no API calls)
  - [x] 3.2 Add tab-aware search wiring
    - Active tab determines the dataset searched (DEs vs queries)
    - Scope includes all DEs/folders that render (local + shared)
  - [x] 3.3 Implement confirmed DE “focus filter”
    - Filter tree visibility to selected DE + direct ancestor folder chain (root -> parents), expanded
    - Prevent showing “aunt/uncle” folders outside the ancestor chain
    - Preserve current DE field lazy-loading behavior (fields fetch only on DE expand)
  - [x] 3.4 Implement “restore previous tree state” on clear
    - Capture prior folder + DE expand/collapse state before applying filter
    - Restore state when clearing the search
  - [x] 3.5 Ensure Task Group 3 tests pass
    - Run ONLY the 2-8 tests written in 3.1

**Acceptance Criteria:**
- DE search is cache-first and only applies filtering on explicit confirm (click or Enter after selection)
- Filtered tree shows only ancestor chain + selected DE and restores prior tree state on clear
- Queries tab search works against in-memory queries with no API calls

### Testing

#### Task Group 4: Feature Test Review & Gap Fill (Only If Needed)
**Dependencies:** Task Groups 1-3

- [x] 4.0 Review feature tests and fill critical gaps only
  - [x] 4.1 Review tests from Task Groups 1-3
  - [x] 4.2 Identify critical workflow gaps specific to this feature
  - [x] 4.3 Write up to 10 additional strategic tests maximum (only if needed)
    - Focus on the highest-risk integration points (search confirm + filter + restore)
  - [x] 4.4 Run feature-specific tests only
    - Run ONLY tests related to this feature (from 1.1, 2.1, 3.1, and 4.3)

**Acceptance Criteria:**
- All feature-specific tests pass
- Any added tests (if necessary) are ≤10 and limited to critical workflows for this spec
