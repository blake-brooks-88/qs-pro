---
phase: 12-security-baseline
plan: 01
subsystem: auth
tags: [session, timeout, owasp, fastify-secure-session, audit, csrf, session-fixation]

# Dependency graph
requires:
  - phase: 09-hardening
    provides: "AuditService, SessionGuard, @fastify/secure-session integration"
provides:
  - "IDLE_TIMEOUT_SECONDS and ABSOLUTE_TIMEOUT_MS constants for session enforcement"
  - "SessionGuard with absolute timeout check and idle touch()"
  - "Session regeneration on all login paths (fixation prevention)"
  - "createdAt timestamp on all sessions for absolute timeout"
  - "auth.session_expired audit event via onResponse hook"
  - "Cache-Control: no-store on logout"
  - "Frontend toast.info on silent re-auth"
affects: [12-02, 12-03, auth, session]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "request.sessionExpiredContext tagging pattern for cross-boundary audit logging"
    - "session.touch() on every authenticated request for idle timeout reset"
    - "session.regenerate() before setting new session data on re-auth"

key-files:
  created:
    - "packages/backend-shared/src/auth/session-timeout.constants.ts"
  modified:
    - "packages/backend-shared/src/auth/session.guard.ts"
    - "packages/backend-shared/src/index.ts"
    - "apps/api/src/configure-app.ts"
    - "apps/api/src/auth/auth.controller.ts"
    - "apps/api/src/main.ts"
    - "apps/web/src/services/api.ts"

key-decisions:
  - "Used @fastify/secure-session expiry option for idle timeout instead of manual lastActivityAt tracking"
  - "Used request.sessionExpiredContext tagging pattern to bridge SessionGuard (backend-shared) and AuditService (api) without circular DI"
  - "Set createdAt as session field (not DB column) since sessions are cookie-based and self-contained"

patterns-established:
  - "Session timeout constants centralized in session-timeout.constants.ts"
  - "Request tagging for cross-module audit context (sessionExpiredContext pattern)"
  - "session.regenerate() before setting new data on every login path"

# Metrics
duration: ~45min
completed: 2026-02-16
---

# Phase 12 Plan 01: Session Timeout Enforcement Summary

**OWASP-compliant session timeout with 30-min idle via @fastify/secure-session expiry, 8-hr absolute via createdAt guard check, session regeneration on re-auth, and audit trail for expiry events**

## Performance

- **Duration:** ~45 min (across two execution windows)
- **Started:** 2026-02-16T18:15:00Z
- **Completed:** 2026-02-16T19:10:00Z
- **Tasks:** 2/2
- **Files modified:** 11

## Accomplishments
- SessionGuard enforces 8-hour absolute timeout via createdAt check and resets idle timer via session.touch() on every authenticated request
- @fastify/secure-session expiry set to 1800 seconds, providing automatic idle timeout without manual tracking
- All three login paths (POST /auth/login, GET /auth/login with JWT, GET /auth/callback) now regenerate session before setting data, preventing session fixation
- onResponse audit hook in main.ts logs auth.session_expired events with reason and actor context
- Logout endpoint hardened with Cache-Control: no-store header
- Frontend shows "Session refreshed" toast on successful silent re-auth via 401 interceptor

## Task Commits

Each task was committed atomically:

1. **Task 1: Session timeout infrastructure and SessionGuard enhancement** - `2cbec11` (feat)
2. **Task 2: Auth controller session lifecycle and audit logging hook** - `e18e47e` (feat)

## Files Created/Modified
- `packages/backend-shared/src/auth/session-timeout.constants.ts` - New: IDLE_TIMEOUT_SECONDS (1800) and ABSOLUTE_TIMEOUT_MS (8hr) constants
- `packages/backend-shared/src/auth/session.guard.ts` - Added absolute timeout check, session.touch(), sessionExpiredContext tagging
- `packages/backend-shared/src/auth/session.guard.unit.test.ts` - Expanded from 4 to 9 tests (touch, absolute timeout, legacy sessions)
- `packages/backend-shared/src/index.ts` - Re-exported timeout constants
- `apps/api/src/configure-app.ts` - Added expiry: IDLE_TIMEOUT_SECONDS to secure-session registration
- `apps/api/src/__tests__/configure-app.unit.test.ts` - Added expiry verification test
- `apps/api/src/auth/auth.controller.ts` - session.regenerate() on all login paths, createdAt timestamps, Cache-Control on logout
- `apps/api/src/auth/__tests__/auth.controller.unit.test.ts` - Updated logout tests with response parameter, added Cache-Control test
- `apps/api/src/main.ts` - Added onResponse hook for auth.session_expired audit logging via sessionExpiredContext
- `apps/web/src/services/api.ts` - Added toast.info("Session refreshed") on successful silent re-auth
- `apps/web/src/services/__tests__/api-error-handling.test.ts` - Added toast.info to sonner mock

## Decisions Made
- **Idle timeout via library expiry, not manual tracking:** The @fastify/secure-session `expiry` option combined with `session.touch()` handles idle timeout via the internal `__ts` field. No need for a manual `lastActivityAt` field.
- **Request tagging for audit context:** Used `request.sessionExpiredContext` to pass expiry context from SessionGuard (in backend-shared) to the onResponse audit hook (in api), avoiding circular dependency between packages.
- **createdAt stored in session cookie:** Since sessions are cookie-based and self-contained, absolute timeout is enforced by storing `createdAt` as a session field rather than a database column.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed toast.info mock missing in api-error-handling test**
- **Found during:** Task 2
- **Issue:** Adding `toast.info("Session refreshed")` to api.ts caused `TypeError: toast.info is not a function` in tests because the sonner mock only included `toast.error`
- **Fix:** Added `info: vi.fn()` to the sonner mock in api-error-handling.test.ts
- **Files modified:** apps/web/src/services/__tests__/api-error-handling.test.ts
- **Verification:** All 17 api-error-handling tests pass
- **Committed in:** e18e47e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minimal - test mock needed to match new runtime behavior. No scope creep.

## Issues Encountered
- lint-staged stash/restore during Task 1 commit created an unintended commit (78aec7a) from dirty working tree state (Plan 12-02 stub removals from prior session). This also reverted some Task 2 in-progress edits, requiring re-application via Write tool.
- Pre-existing Fastify type incompatibility in configure-app.ts required `as unknown as FastifyPluginAsync` cast (auto-applied by linter).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Session timeout infrastructure is complete and ready for Plan 12-02 (CSRF guard) and 12-03 (CORS/headers)
- The sessionExpiredContext pattern can be extended for other session-related audit events
- All existing tests pass; no regressions introduced

## Self-Check: PASSED

All files verified present. All commits verified in history.
- [x] packages/backend-shared/src/auth/session-timeout.constants.ts
- [x] packages/backend-shared/src/auth/session.guard.ts
- [x] packages/backend-shared/src/index.ts
- [x] apps/api/src/configure-app.ts
- [x] apps/api/src/auth/auth.controller.ts
- [x] apps/api/src/main.ts
- [x] apps/web/src/services/api.ts
- [x] Commit 2cbec11 (Task 1)
- [x] Commit e18e47e (Task 2)

---
*Phase: 12-security-baseline*
*Completed: 2026-02-16*
