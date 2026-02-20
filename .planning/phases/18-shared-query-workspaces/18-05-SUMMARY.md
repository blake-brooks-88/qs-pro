---
phase: 18-shared-query-workspaces
plan: 05
subsystem: testing
tags: [vitest, integration-test, msw, react-testing-library, rls, stale-detection, feature-gating]

# Dependency graph
requires:
  - phase: 18-01
    provides: "Database schema (visibility column, updated_by_user_id, RLS policies)"
  - phase: 18-02
    provides: "Backend service layer (shared folders, stale detection, feature gating)"
  - phase: 18-03
    provides: "Frontend sidebar split (SharedQuerySection, PremiumBadge, LockedSharedTeaser)"
  - phase: 18-04
    provides: "Stale detection hook/dialog, share confirmation dialog, enhanced delete warning"
provides:
  - "Integration tests for shared folder CRUD with feature gating"
  - "Integration tests for stale detection (409 STALE_CONTENT)"
  - "Integration tests confirming deployToAutomation gates link/publish/drift/blast (unchanged)"
  - "Component tests for SharedQuerySection (Enterprise badge, locked teaser, context menus, downgrade)"
  - "Component tests for StaleWarningDialog and ShareConfirmationDialog"
  - "Hook tests for useStaleDetection ref-based hash tracking"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integration test pattern: withRls() + setTenantTier() for multi-tenant feature gating tests"
    - "MSW override pattern: server.use() per-test for feature flag switching"
    - "useRef hook testing pattern: rerender() required after act() to read updated ref values"

key-files:
  created:
    - "apps/api/src/folders/__tests__/folders-shared.integration.test.ts"
    - "apps/api/src/saved-queries/__tests__/saved-queries-stale.integration.test.ts"
    - "apps/api/src/query-activities/__tests__/query-activities-deploy-gating.integration.test.ts"
    - "apps/web/src/features/editor-workspace/components/__tests__/SharedQuerySection.test.tsx"
    - "apps/web/src/features/editor-workspace/components/__tests__/StaleWarningDialog.test.tsx"
    - "apps/web/src/features/editor-workspace/components/__tests__/ShareConfirmationDialog.test.tsx"
    - "apps/web/src/features/editor-workspace/hooks/__tests__/use-stale-detection.test.ts"
  modified:
    - "apps/web/src/test/mocks/handlers.ts"

key-decisions:
  - "RLS prevents cross-user visibility of personal folders, making ownership validation unreachable via API (tested as RESOURCE_NOT_FOUND)"
  - "Deploy gating tests use HTTP-level assertions (supertest) rather than service-level to verify full controller+guard pipeline"
  - "useRef hook tests require explicit rerender() calls since ref mutations do not trigger re-renders"

patterns-established:
  - "Multi-tier feature gating test pattern: setTenantTier('free'|'pro'|'enterprise') with withRls() context"
  - "Downgrade test pattern: feature disabled + existing shared content = read-only mode"

# Metrics
duration: 45min
completed: 2025-02-20
---

# Phase 18, Plan 05: Comprehensive Test Coverage Summary

**71 new test cases across 7 files covering shared folder CRUD gating, stale detection 409 responses, deploy-gating confirmation for link/publish/drift/blast, two-section sidebar rendering, and ref-based hash tracking**

## Performance

- **Duration:** ~45 min
- **Started:** 2025-02-20T00:40:00Z
- **Completed:** 2025-02-20T01:12:00Z
- **Tasks:** 2
- **Files created:** 7
- **Files modified:** 1

## Accomplishments

- 17 integration tests for shared folder CRUD with feature gating (free/pro rejected, enterprise allowed), RLS visibility (personal vs shared), BU-owned operations, and creatorName resolution
- 8 integration tests for stale detection (hash match/mismatch, 409 STALE_CONTENT, backwards compat, updatedByUserName tracking, latestVersionHash changes)
- 17 integration tests confirming deployToAutomation continues to gate all query-activity endpoints (free blocked, pro/enterprise succeed) -- Phase 18 did NOT change this gating
- 9 component tests for SharedQuerySection (Enterprise badge via aria-label, locked teaser, shared tree, creator attribution, context menus, read-only downgrade, query selection, New Shared Folder button)
- 7 component tests for StaleWarningDialog (dialog rendering, conflicting user name, generic message, button callbacks, closed state)
- 6 component tests for ShareConfirmationDialog (folder/query messages, Share/Cancel buttons, item name in title, closed state)
- 7 hook tests for useStaleDetection (initial null state, trackOpened, updateHash, clearHash, latest-wins, callback stability)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend integration tests** - `b25e76e` (test)
2. **Task 2: Frontend component and hook tests** - `7502624` (test)

## Files Created/Modified

- `apps/api/src/folders/__tests__/folders-shared.integration.test.ts` - 17 integration tests: feature gating, RLS visibility, shared CRUD, share ownership, creatorName
- `apps/api/src/saved-queries/__tests__/saved-queries-stale.integration.test.ts` - 8 integration tests: expectedHash comparison, 409 STALE_CONTENT, updatedByUserName, latestVersionHash
- `apps/api/src/query-activities/__tests__/query-activities-deploy-gating.integration.test.ts` - 17 integration tests: free-tier blocked (6 endpoints), pro-tier succeeds (7), enterprise-tier succeeds (4)
- `apps/web/src/features/editor-workspace/components/__tests__/SharedQuerySection.test.tsx` - 9 component tests: Enterprise badge, locked teaser, folder tree, creator attribution, context menus, read-only downgrade
- `apps/web/src/features/editor-workspace/components/__tests__/StaleWarningDialog.test.tsx` - 7 component tests: dialog rendering, conflicting user, button callbacks
- `apps/web/src/features/editor-workspace/components/__tests__/ShareConfirmationDialog.test.tsx` - 6 component tests: folder/query sharing messages, callbacks
- `apps/web/src/features/editor-workspace/hooks/__tests__/use-stale-detection.test.ts` - 7 hook tests: ref-based hash tracking, callback stability
- `apps/web/src/test/mocks/handlers.ts` - Added `teamCollaboration: false` to default features mock

## Decisions Made

- **RLS blocks cross-user personal folder visibility**: When testing "only creator can share", User B cannot see User A's personal folder due to RLS, so the error is RESOURCE_NOT_FOUND (not VALIDATION_ERROR). Test adjusted to match actual behavior.
- **Deploy gating tests use HTTP-level (supertest)**: Rather than service-level tests, these use full HTTP requests through controller+guard pipeline to verify the complete feature gate chain.
- **useRef tests require rerender()**: Since useRef mutations don't trigger React re-renders, hook tests must call `rerender()` after `act()` to observe updated `openedHash` values.
- **PremiumBadge at size="sm" renders icon only**: Test uses `getByLabelText("Enterprise feature")` instead of text match since the small badge only shows the crown icon with an aria-label.
- **CreatorAttribution renders combined text**: Uses regex matcher `/Alice/` since the component renders "Alice . 14mo ago" as a single text node.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed SharedQuerySection test assertion for Enterprise badge**
- **Found during:** Task 2 (Frontend tests)
- **Issue:** PremiumBadge with `size="sm"` renders only an icon, not "Enterprise" text. Test used `getByText("Enterprise")` which failed.
- **Fix:** Changed to `getByLabelText("Enterprise feature")` matching the button's aria-label
- **Files modified:** SharedQuerySection.test.tsx
- **Committed in:** 7502624

**2. [Rule 1 - Bug] Fixed CreatorAttribution text matching**
- **Found during:** Task 2 (Frontend tests)
- **Issue:** CreatorAttribution renders "Alice . 14mo ago" as a single text node. `getByText("Alice")` exact match failed.
- **Fix:** Changed to `getByText(/Alice/)` regex match
- **Files modified:** SharedQuerySection.test.tsx
- **Committed in:** 7502624

**3. [Rule 1 - Bug] Fixed useStaleDetection test for useRef re-render behavior**
- **Found during:** Task 2 (Frontend tests)
- **Issue:** useRef mutations don't trigger re-renders, so `result.current.openedHash` remained null after `act()` calls.
- **Fix:** Added `rerender()` calls after each `act()` to read updated ref values
- **Files modified:** use-stale-detection.test.ts
- **Committed in:** 7502624

---

**Total deviations:** 3 auto-fixed (3 bugs in test assertions)
**Impact on plan:** All auto-fixes corrected test assertion logic to match actual component behavior. No scope creep.

## Issues Encountered

- **Database migrations not pre-applied**: The `updated_by_user_id` and `visibility` columns required by Phase 18 tests weren't in the test database. Resolved by applying Phase 18 migrations manually via Docker psql.
- **RLS test expectation mismatch**: Initially expected VALIDATION_ERROR for non-owner share attempt, but RLS prevents the query from finding the folder at all, returning RESOURCE_NOT_FOUND instead. Adjusted test expectations.
- **Publish endpoint versionId validation**: Used string 'ver-1' which isn't a valid UUID, causing 400 before feature gate check. Fixed by using a proper UUID constant.
- **Link endpoint mock configuration**: mockQDService.retrieveDetail wasn't configured, causing 404. Added proper mock return values.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 18 is now fully complete with comprehensive test coverage
- All 71 new tests pass alongside 2325 existing web tests and 350 backend tests
- No regressions detected in any existing test suite

---
*Phase: 18-shared-query-workspaces*
*Completed: 2025-02-20*
