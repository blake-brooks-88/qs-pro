---
phase: 18-shared-query-workspaces
plan: 04
subsystem: ui
tags: [react, radix, zustand, stale-detection, conflict-resolution, feature-gating]

requires:
  - phase: 18-01
    provides: STALE_CONTENT error code, expectedHash and latestVersionHash on saved-query schemas
  - phase: 18-02
    provides: Stale detection on shared query saves via expectedHash comparison, latestVersionHash in GET response
  - phase: 18-03
    provides: Two-section sidebar, isActiveQueryInSharedFolder, SharedQuerySection with readOnly downgrade
provides:
  - StaleWarningDialog component with Overwrite, Reload, Cancel conflict resolution
  - useStaleDetection hook tracking opened SQL hash for stale detection
  - Enhanced save flow with expectedHash for shared queries and 409 error handling
  - Enhanced delete confirmation dialog for shared queries/folders with team visibility warning
  - Publish button gated to shared folder queries only (not shown for personal queries)
  - DnD to shared zone blocked when teamCollaboration is disabled (downgrade)
affects: [18-05]

tech-stack:
  added: []
  patterns:
    - "Stale detection via useRef hash tracking + expectedHash on PATCH requests"
    - "Three-button conflict dialog: Overwrite/Reload/Cancel for concurrent edit resolution"
    - "Enhanced delete warnings for shared content with team visibility messaging"

key-files:
  created:
    - apps/web/src/features/editor-workspace/hooks/use-stale-detection.ts
    - apps/web/src/features/editor-workspace/components/StaleWarningDialog.tsx
  modified:
    - apps/web/src/features/editor-workspace/hooks/use-save-flows.ts
    - apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx
    - apps/web/src/features/editor-workspace/components/EditorToolbar.tsx
    - apps/web/src/features/editor-workspace/components/QueryTreeView.tsx
    - apps/web/src/features/editor-workspace/components/__tests__/EditorWorkspace-publish.test.tsx

key-decisions:
  - "Stale detection uses useRef (not useState) to avoid re-renders on hash changes"
  - "409 STALE_CONTENT errors intercepted in executeSave before generic error toast"
  - "Publish button requires both linkedQaCustomerKey AND isActiveQueryInSharedFolder"
  - "Enhanced delete uses existing ConfirmationDialog with danger variant for shared items"
  - "DnD to shared zone shows informative Enterprise subscription toast when teamCollaboration disabled"

patterns-established:
  - "executeSave(forceOverwrite) pattern: single function handles both normal and force-overwrite saves"
  - "Stale reload via direct API fetch + storeUpdateTabContent (bypasses TanStack cache stale data)"

duration: 32min
completed: 2026-02-20
---

# Phase 18 Plan 04: Stale Detection, Enhanced Delete Warnings, and Publish Gating Summary

**Stale detection with three-button conflict dialog, enhanced shared delete warnings with team visibility messaging, publish button gated to shared folder queries, and downgrade DnD blocking**

## Performance

- **Duration:** 32 min
- **Started:** 2026-02-20T05:45:05Z
- **Completed:** 2026-02-20T06:17:28Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Stale detection prevents accidental overwrites of concurrent shared edits via expectedHash comparison
- StaleWarningDialog offers Overwrite (force save), Reload (fetch latest), and Cancel for conflict resolution
- Enhanced delete confirmation for shared queries/folders with "visible to your team" warning
- Publish button correctly hidden for personal queries (only shown when linked AND in shared folder)
- DnD to shared zone blocked with informative toast when Enterprise teamCollaboration is disabled

## Task Commits

Each task was committed atomically:

1. **Task 1: Stale detection hook and stale warning dialog** - `2026da2` (feat)
2. **Task 2: Link button visibility, enhanced delete warning, and downgrade UX** - `16229cc` (feat)

## Files Created/Modified
- `apps/web/src/features/editor-workspace/hooks/use-stale-detection.ts` - Hook tracking opened SQL hash via useRef for stale detection on save
- `apps/web/src/features/editor-workspace/components/StaleWarningDialog.tsx` - Three-button dialog for concurrent edit conflict resolution
- `apps/web/src/features/editor-workspace/hooks/use-save-flows.ts` - Extended with expectedHash in PATCH, 409 error handling, overwrite/reload/cancel flow
- `apps/web/src/features/editor-workspace/components/EditorWorkspace.tsx` - Wired stale detection hook and dialog, passes hash tracking to save flows
- `apps/web/src/features/editor-workspace/components/EditorToolbar.tsx` - Publish button gated to isActiveQueryInSharedFolder
- `apps/web/src/features/editor-workspace/components/QueryTreeView.tsx` - Enhanced shared delete confirmation, DnD downgrade blocking
- `apps/web/src/features/editor-workspace/components/__tests__/EditorWorkspace-publish.test.tsx` - Updated with shared folder mock and savedQueries data for publish gating

## Decisions Made
- **useRef for hash tracking:** Using `useRef` instead of `useState` avoids unnecessary re-renders when the hash changes. The hash is only read during save, not during render.
- **executeSave(forceOverwrite) pattern:** A single function handles both normal saves (with expectedHash) and force-overwrite saves (without expectedHash). The `forceOverwrite` flag controls whether the hash is sent.
- **Stale reload via direct API fetch:** When reloading after a stale conflict, the latest content is fetched directly via `api.get()` and the tab is updated via `storeUpdateTabContent`. This bypasses the TanStack cache which might still have stale data.
- **Publish requires shared folder:** Per the plan, the publish button now requires `isActiveQueryInSharedFolder` in addition to `linkedQaCustomerKey`. Linked queries in personal folders cannot publish (they must be in shared folders).
- **DnD downgrade toast:** When `teamCollaboration` is disabled, attempts to drag items to the shared zone show an informative toast rather than silently blocking, matching the pattern used for other DnD blocking scenarios.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated publish test fixtures for shared folder requirement**
- **Found during:** Task 2 (Test verification)
- **Issue:** `EditorWorkspace-publish.test.tsx` didn't mock `useFolders` or provide `savedQueries` with a shared folder, so `isActiveQueryInSharedFolder` was always `false` and the publish button never rendered
- **Fix:** Added `useFolders` mock returning a shared folder, added `createLinkedProps()` helper with `savedQueries` containing the linked query in the shared folder
- **Files modified:** `apps/web/src/features/editor-workspace/components/__tests__/EditorWorkspace-publish.test.tsx`
- **Verification:** All 9 publish tests pass including the 6 previously failing ones
- **Committed in:** `16229cc` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Test fixture update was necessary to reflect the new publish button gating behavior. No scope creep. The test correctly validates the new shared-folder requirement for publish.

## Issues Encountered
None - all tasks executed cleanly once test fixtures were updated for the new publish gating behavior.

## User Setup Required
None - no external service configuration required. Backend stale detection from Plans 01 and 02 must already be deployed.

## Next Phase Readiness
- Stale detection fully wired for Plan 05 (any remaining shared workspace refinements)
- Enhanced delete warnings protect against accidental shared content deletion
- Publish gating enforces shared-folder-first linking requirement
- All 168 web test files pass (2296 tests), typecheck clean

## Self-Check: PASSED

- [x] 18-04-SUMMARY.md exists
- [x] use-stale-detection.ts exists
- [x] StaleWarningDialog.tsx exists
- [x] Commit 2026da2 exists (Task 1)
- [x] Commit 16229cc exists (Task 2)
- [x] All 168 web test files pass (2296 tests)
- [x] Typecheck clean

---
*Phase: 18-shared-query-workspaces*
*Completed: 2026-02-20*
