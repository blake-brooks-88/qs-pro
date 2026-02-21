---
phase: 18-shared-query-workspaces
plan: 03
subsystem: ui
tags: [react, dnd-kit, radix, zustand, sidebar, feature-gating, enterprise]

requires:
  - phase: 18-01
    provides: visibility column on folders, teamCollaboration feature key, FolderResponseSchema with visibility/userId/creatorName
  - phase: 18-02
    provides: POST /folders/:id/share endpoint, shared folder CRUD with feature gating, updatedByUserName in responses
provides:
  - Two-section sidebar with "My Queries" and "Shared Queries" collapsible sections
  - SharedQuerySection with Enterprise feature gating and PremiumBadge upgrade popover
  - ShareConfirmationDialog for drag-to-shared workflow
  - CreatorAttribution component for shared item metadata display
  - Cross-section DnD with personal-to-shared confirmation and shared-to-personal blocking
  - Link context menu hidden for personal queries (toolbar and tree)
  - Duplicate to Personal context menu action for shared queries
  - Sidebar search with section indicators for shared query results
  - useShareFolder hook for frontend share folder API calls
affects: [18-04, 18-05]

tech-stack:
  added: []
  patterns:
    - "Two-section sidebar pattern with visibility-based folder/query splitting"
    - "Read-only downgrade mode: shared items visible but non-editable when feature disabled"
    - "Section-aware DnD: cross-section drops trigger confirmation or toast blocking"

key-files:
  created:
    - apps/web/src/features/editor-workspace/components/SharedQuerySection.tsx
    - apps/web/src/features/editor-workspace/components/ShareConfirmationDialog.tsx
    - apps/web/src/features/editor-workspace/components/CreatorAttribution.tsx
  modified:
    - apps/web/src/features/editor-workspace/components/QueryTreeView.tsx
    - apps/web/src/features/editor-workspace/components/EditorToolbar.tsx
    - apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx
    - apps/web/src/features/editor-workspace/components/WorkspaceSidebar.tsx
    - apps/web/src/features/editor-workspace/hooks/use-folders.ts
    - apps/web/src/features/editor-workspace/components/__tests__/QueryTreeView-linking.test.tsx

key-decisions:
  - "Link option hidden entirely for personal queries in both context menu and toolbar (not disabled, not shown)"
  - "Shared-to-personal DnD blocked with informative toast directing users to Duplicate to Personal"
  - "Individual queries cannot be dragged to shared zone directly; only folders can be shared"
  - "Sidebar search uses UsersGroupRounded icon + 'Shared' badge to indicate shared query results"
  - "isActiveQueryInSharedFolder derived from folder visibility map in EditorWorkspace for toolbar link button gating"

patterns-established:
  - "folderVisibilityMap: Map<string, 'personal' | 'shared'> for section assignment"
  - "Separate create/expand state for personal and shared sections"
  - "Read-only mode via readOnly prop propagation to SharedFolderNode and SharedQueryNode"

duration: 22min
completed: 2026-02-20
---

# Phase 18 Plan 03: Frontend Sidebar with Personal/Shared Split Summary

**Two-section sidebar with PopSQL-style personal/shared split, Enterprise feature gating with upgrade popover, cross-section DnD with confirmation, and link option hidden for personal queries**

## Performance

- **Duration:** 22 min
- **Started:** 2026-02-20T05:19:45Z
- **Completed:** 2026-02-20T05:42:08Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Sidebar restructured into "My Queries" and "Shared Queries" collapsible sections with folder visibility filtering
- Enterprise feature gating with PremiumBadge upgrade popover for non-Enterprise users on Shared Queries section
- Cross-section DnD with ShareConfirmationDialog for personal-to-shared, toast blocking for shared-to-personal
- Link option completely hidden for personal queries (both context menu and EditorToolbar)
- CreatorAttribution component showing creator name and relative time on shared items
- Duplicate to Personal context menu action for shared queries
- Sidebar search enhanced with section indicators for shared query results
- Downgrade read-only mode: shared content visible but non-editable when teamCollaboration disabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Split QueryTreeView into two sections with folder visibility filtering** - `03be2be` (feat)
2. **Task 2: Cross-section DnD with share confirmation dialog and sidebar search** - `1f31d5e` (feat)

## Files Created/Modified
- `apps/web/src/features/editor-workspace/components/SharedQuerySection.tsx` - New shared queries section with Enterprise gating, read-only downgrade, and full CRUD context menus
- `apps/web/src/features/editor-workspace/components/ShareConfirmationDialog.tsx` - Confirmation dialog for drag-to-shared operations using existing ConfirmationDialog
- `apps/web/src/features/editor-workspace/components/CreatorAttribution.tsx` - Inline creator name + relative time metadata display for shared items
- `apps/web/src/features/editor-workspace/components/QueryTreeView.tsx` - Restructured into two sections with visibility-based filtering, cross-section DnD logic, share confirmation state
- `apps/web/src/features/editor-workspace/components/EditorToolbar.tsx` - Added isActiveQueryInSharedFolder prop to conditionally show/hide link button
- `apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx` - Added folder visibility detection for active tab, passes isActiveQueryInSharedFolder to toolbar
- `apps/web/src/features/editor-workspace/components/WorkspaceSidebar.tsx` - Enhanced search with folder visibility map and "Shared" section indicator
- `apps/web/src/features/editor-workspace/hooks/use-folders.ts` - Added useShareFolder mutation hook for POST /folders/:id/share
- `apps/web/src/features/editor-workspace/components/__tests__/QueryTreeView-linking.test.tsx` - Updated tests to verify link hidden for personal queries, added visibility fields to mock data

## Decisions Made
- **Link hidden entirely for personal queries:** Per locked decision, link context menu item and toolbar button are not rendered (not disabled) for personal queries. Users discover the shared-folder requirement organically.
- **Shared-to-personal DnD blocked with toast:** Rather than silently ignoring, a toast guides users to "Duplicate to Personal" from the context menu.
- **Individual query drag to shared zone blocked:** Only folders can be shared (queries inherit visibility from their folder). A toast explains this when a query is dragged to the shared zone.
- **isActiveQueryInSharedFolder computation:** Derived in EditorWorkspace by looking up the active tab's folderId in the folder visibility map, passed to EditorToolbar as a prop.
- **Sidebar search section indicator:** Uses UsersGroupRounded icon with "Shared" text label for queries in shared folders, using the savedQueryFolders visibility map.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated linking test fixtures for visibility field**
- **Found during:** Task 1 (Test verification)
- **Issue:** `QueryTreeView-linking.test.tsx` used mock folders without `visibility` and `userId` fields, and expected "Link to Query Activity" to appear for personal queries
- **Fix:** Added `visibility: "personal"` and `userId: "u1"` to mock folders; replaced tests expecting link on personal queries with test verifying link is NOT shown; added features mock handler
- **Files modified:** `apps/web/src/features/editor-workspace/components/__tests__/QueryTreeView-linking.test.tsx`
- **Verification:** All 4 linking tests pass, including new "does NOT show Link for personal queries" test
- **Committed in:** `03be2be` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test fixture update was necessary to match the new behavior. No scope creep. The test change correctly reflects the locked decision to hide link for personal queries.

## Issues Encountered
None - all tasks executed cleanly.

## User Setup Required
None - no external service configuration required. Backend APIs from Plans 01 and 02 must already be deployed.

## Next Phase Readiness
- Frontend sidebar fully supports personal/shared split for Plans 04-05
- Share confirmation dialog ready for any remaining DnD refinements
- useShareFolder hook available for any additional sharing workflows
- CreatorAttribution available for reuse in other shared content views
- All 168 web test files pass (2296 tests), typecheck clean

## Self-Check: PASSED

- [x] 18-03-SUMMARY.md exists
- [x] SharedQuerySection.tsx exists
- [x] ShareConfirmationDialog.tsx exists
- [x] CreatorAttribution.tsx exists
- [x] Commit 03be2be exists (Task 1)
- [x] Commit 1f31d5e exists (Task 2)
- [x] All 168 web test files pass (2296 tests)
- [x] Typecheck clean

---
*Phase: 18-shared-query-workspaces*
*Completed: 2026-02-20*
