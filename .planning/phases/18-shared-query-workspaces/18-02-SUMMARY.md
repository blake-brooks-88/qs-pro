---
phase: 18-shared-query-workspaces
plan: 02
subsystem: api
tags: [nestjs, drizzle, rls, feature-flags, stale-detection, folders, saved-queries]

requires:
  - phase: 18-01
    provides: visibility column, conditional RLS, teamCollaboration feature key, STALE_CONTENT error code, shared-types schemas
provides:
  - Shared folder CRUD gated behind teamCollaboration Enterprise feature
  - POST /folders/:id/share endpoint for drag-to-shared workflow
  - Stale detection on shared query saves via expectedHash comparison
  - latestVersionHash in GET /saved-queries/:id response
  - updatedByUserId tracking on every saved query update
  - updatedByUserName and creatorName in API responses via users table JOINs
affects: [18-03, 18-04, 18-05]

tech-stack:
  added: []
  patterns:
    - "Feature gating via FeaturesService.getTenantFeatures() injected into domain services"
    - "USER_REPOSITORY injection for cross-entity name resolution in saved-queries module"
    - "creatorName via LEFT JOIN on repository findAll/findById, null on create (frontend knows creator)"

key-files:
  created: []
  modified:
    - apps/api/src/folders/folders.service.ts
    - apps/api/src/folders/folders.controller.ts
    - apps/api/src/folders/folders.repository.ts
    - apps/api/src/folders/drizzle-folders.repository.ts
    - apps/api/src/folders/folders.module.ts
    - apps/api/src/saved-queries/saved-queries.service.ts
    - apps/api/src/saved-queries/saved-queries.controller.ts
    - apps/api/src/saved-queries/saved-queries.repository.ts
    - apps/api/src/saved-queries/drizzle-saved-queries.repository.ts
    - apps/api/src/saved-queries/saved-queries.module.ts
    - packages/shared-types/src/audit.ts

key-decisions:
  - "Used VALIDATION_ERROR instead of FORBIDDEN for ownership checks (FORBIDDEN error code does not exist in codebase)"
  - "Injected USER_REPOSITORY into SavedQueriesModule for updatedByUserName resolution"
  - "creatorName returned as null from create() since frontend already knows the creator identity"
  - "Stale detection error omits conflictingUserId (ErrorContext does not support arbitrary fields)"

patterns-established:
  - "Feature gating pattern: private requireTeamCollaboration() method calls FeaturesService before protected operations"
  - "Folder repository returns custom Folder interface (not Drizzle $inferSelect) to include JOIN-derived fields"

duration: 17min
completed: 2026-02-20
---

# Phase 18 Plan 02: Backend Logic for Shared Folders and Stale Detection Summary

**Shared folder CRUD gated behind teamCollaboration feature with stale detection on saves, latestVersionHash in detail responses, and updatedByUserId tracking**

## Performance

- **Duration:** 17 min
- **Started:** 2026-02-20T04:59:45Z
- **Completed:** 2026-02-20T05:17:09Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Shared folder operations (create, update, share) gated behind `teamCollaboration` Enterprise feature via `FeaturesService`
- `POST /folders/:id/share` endpoint with `folder.shared` audit event for drag-to-shared workflow
- Stale detection in `SavedQueriesService.update()` compares `expectedHash` against latest version, throws `STALE_CONTENT` (409) on mismatch
- `latestVersionHash` returned in `GET /saved-queries/:id` for frontend stale tracking
- `updatedByUserId` tracked on every saved query update; `updatedByUserName` resolved via users JOIN
- `creatorName` returned in folder responses via LEFT JOIN with users table

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared folder service, repository, and controller changes** - `9120492` (feat)
2. **Task 2: Stale detection, latestVersionHash, and updatedByUserId tracking** - `55d8258` (feat)

## Files Created/Modified
- `apps/api/src/folders/folders.repository.ts` - Custom Folder interface with creatorName field
- `apps/api/src/folders/drizzle-folders.repository.ts` - LEFT JOIN users for creatorName in findAll/findById
- `apps/api/src/folders/folders.service.ts` - Feature gating, shareFolder(), requireTeamCollaboration()
- `apps/api/src/folders/folders.controller.ts` - POST :id/share endpoint, creatorName in toResponse
- `apps/api/src/folders/folders.module.ts` - FeaturesModule import
- `apps/api/src/saved-queries/saved-queries.service.ts` - Stale detection, updatedByUserId, latestVersionHash, resolveUserName
- `apps/api/src/saved-queries/saved-queries.controller.ts` - latestVersionHash and updatedByUserName in responses
- `apps/api/src/saved-queries/saved-queries.repository.ts` - updatedByUserId in UpdateSavedQueryParams, updatedByUserName in SavedQueryListItem
- `apps/api/src/saved-queries/drizzle-saved-queries.repository.ts` - Users JOIN for updatedByUserName, updatedByUserId write
- `apps/api/src/saved-queries/saved-queries.module.ts` - USER_REPOSITORY provider (DrizzleUserRepository)
- `packages/shared-types/src/audit.ts` - folder.shared audit event type

## Decisions Made
- **VALIDATION_ERROR for ownership checks:** Plan referenced `ErrorCode.FORBIDDEN` which does not exist. Used `VALIDATION_ERROR` (400) instead, consistent with "cannot delete folder with contents" pattern.
- **USER_REPOSITORY injection:** Added `DrizzleUserRepository` provider to `SavedQueriesModule` for resolving `updatedByUserName` from `updatedByUserId`. Follows the existing pattern of repository injection via module providers.
- **creatorName null on create:** `DrizzleFoldersRepository.create()` returns `creatorName: null` since the frontend already knows the current user. JOINed value available on subsequent findAll/findById.
- **Stale detection without conflictingUserId:** `ErrorContext` is strictly typed and doesn't support `conflictingUserId`. The `reason` field communicates the stale condition; frontend can reload to see who changed it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added folder.shared audit event type**
- **Found during:** Task 1 (FoldersController)
- **Issue:** Plan specified `@Audited('folder.shared')` but `folder.shared` was not in the `AuditEventType` union
- **Fix:** Added `folder.shared` to the type union and `AUDIT_EVENT_TYPES` array in `packages/shared-types/src/audit.ts`
- **Files modified:** `packages/shared-types/src/audit.ts`
- **Verification:** Typecheck passes, controller compiles
- **Committed in:** `9120492` (Task 1 commit)

**2. [Rule 3 - Blocking] Injected USER_REPOSITORY for updatedByUserName resolution**
- **Found during:** Task 2 (SavedQueriesService)
- **Issue:** `updatedByUserName` requires looking up user by `updatedByUserId`, but SavedQueriesService had no user repository access
- **Fix:** Added `USER_REPOSITORY` provider to `SavedQueriesModule` using `DrizzleUserRepository`, injected into service with `resolveUserName()` helper
- **Files modified:** `saved-queries.module.ts`, `saved-queries.service.ts`
- **Verification:** All 406 API tests pass, typecheck clean
- **Committed in:** `55d8258` (Task 2 commit)

**3. [Rule 3 - Blocking] Updated test fixtures for DecryptedSavedQuery new fields**
- **Found during:** Task 2 (Typecheck)
- **Issue:** Adding `latestVersionHash` and `updatedByUserName` to `DecryptedSavedQuery` broke mock objects in 3 test files
- **Fix:** Added `latestVersionHash: null` and `updatedByUserName: null` to mock fixtures; added `USER_REPOSITORY` stub to test module providers
- **Files modified:** `saved-queries.controller.unit.test.ts`, `saved-queries.service.publish.unit.test.ts`, `query-activities.service.publish.unit.test.ts`, `query-activities.service.unit.test.ts`
- **Verification:** All 406 API tests pass
- **Committed in:** `55d8258` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** All fixes necessary for type safety and test correctness. No scope creep. The USER_REPOSITORY injection and audit event type additions are minimal infrastructure needed by the planned features.

## Issues Encountered
None - all tasks executed cleanly once downstream type propagation was handled.

## User Setup Required
None - no external service configuration required. Database migration from Plan 01 must already be applied.

## Next Phase Readiness
- Backend API fully supports shared folder CRUD with feature gating
- Stale detection ready for frontend to send `expectedHash` on saves
- `latestVersionHash` available for `useStaleDetection.trackOpened()` in frontend
- `updatedByUserName` and `creatorName` ready for frontend display in Plans 04-05
- Query-activities endpoints unchanged per locked decision

## Self-Check: PASSED

- [x] 18-02-SUMMARY.md exists
- [x] Commit 9120492 exists (Task 1)
- [x] Commit 55d8258 exists (Task 2)
- [x] All 406 API tests pass
- [x] Typecheck clean across all packages

---
*Phase: 18-shared-query-workspaces*
*Completed: 2026-02-20*
