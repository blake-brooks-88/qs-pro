# Task Breakdown: Sidebar DE Folder Explorer

## Overview
Total Tasks: 3

## Task List

### Frontend Data Layer

#### Task Group 1: Metadata Queries and Shared Cache
**Dependencies:** None

- [x] 1.0 Complete metadata query layer
  - [x] 1.1 Write 2-6 focused tests for metadata query hooks
    - Cover root folders + DE list fetch
    - Cover field fetch by customer key
    - Cover cache reuse (no duplicate fetch on re-expand)
    - Ensure query keys are tenant/eid and customer-key scoped
  - [x] 1.2 Implement TanStack Query hooks for folders, DEs, and fields
    - Replace `useMetadata` effect-driven fetch with query hooks
    - Share query keys between sidebar and future autocomplete
    - Configure `staleTime`/`gcTime` to keep metadata warm in memory
  - [x] 1.3 Add prefetch path for DE names
    - Prefetch full DE list after initial load for autocomplete
    - Keep fields lazy-loaded by customer key
  - [x] 1.4 Ensure metadata query tests pass
    - Run ONLY the tests written in 1.1

**Acceptance Criteria:**
- Metadata queries use TanStack Query with stable query keys
- DE list and field data is cached and shared across features
- 2-6 tests from 1.1 pass

### Frontend UI

#### Task Group 2: Sidebar Tree + Lazy Expansion
**Dependencies:** Task Group 1

- [x] 2.0 Complete sidebar explorer UI
  - [x] 2.1 Write 2-6 focused tests for sidebar tree behavior
    - Initial render shows root folders
    - Expanding folder loads and renders children
    - Expanding DE shows field list
    - Sorting places folders before DEs alphabetically
  - [x] 2.2 Update `WorkspaceSidebar` tree rendering
    - Add expand/collapse controls with `aria-expanded`
    - Show minimal loading indicator for folder expansion
    - Keep DE nodes collapsed by default with name-only display
    - Render fields with name + type, using `font-mono` for type
    - Remove search input for this iteration
  - [x] 2.3 Wire updated data flow into `EditorWorkspacePage`
    - Pass down query data and expansion handlers
    - Keep existing sidebar collapse behavior intact
  - [x] 2.4 Ensure sidebar UI tests pass
    - Run ONLY the tests written in 2.1

**Acceptance Criteria:**
- Sidebar lazily loads folders/DEs/fields without extra fetches
- Folders and DEs are sorted as specified
- Field type uses JetBrains Mono stack
- 2-6 tests from 2.1 pass

### Testing

#### Task Group 3: Test Review & Gap Analysis
**Dependencies:** Task Groups 1-2

- [x] 3.0 Review and fill critical test gaps (if any)
  - [x] 3.1 Review tests added in Task Groups 1-2
  - [x] 3.2 Identify any missing critical user flows for this feature
  - [x] 3.3 Add up to 5 targeted tests only if gaps exist
  - [x] 3.4 Run ONLY the tests from Task Groups 1-2 and 3.3

**Acceptance Criteria:**
- All feature-specific tests pass
- No more than 5 additional tests added
- Coverage focuses only on sidebar explorer + metadata caching

