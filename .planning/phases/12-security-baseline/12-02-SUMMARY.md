---
phase: 12-security-baseline
plan: 02
subsystem: security
tags: [fastify, axios, security-headers, dependency-audit, x-frame-options, attack-surface]

# Dependency graph
requires:
  - phase: 11-api-hardening
    provides: rate limiting, validation pipe, RLS tests
provides:
  - Stub/debug endpoint removal (AppController, UsersController)
  - X-Frame-Options defense-in-depth header
  - HIGH dependency vulnerability remediation (fastify, axios)
  - Transitive dependency overrides (brace-expansion, qs, webpack, lodash, diff)
  - Debug code scan with findings documented
affects: [16-appexchange-security-review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pnpm.overrides for transitive dependency vulnerability remediation"

key-files:
  created: []
  modified:
    - apps/api/src/app.module.ts
    - apps/api/src/main.ts
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "pnpm.overrides for transitive dependency pinning (fastify, axios, brace-expansion, qs, webpack, lodash, diff)"
  - "esbuild moderate vuln accepted (dev-only via vite@5, not overridable without breaking vite)"
  - "X-Frame-Options: SAMEORIGIN as defense-in-depth alongside CSP frame-ancestors"

patterns-established:
  - "pnpm.overrides in root package.json for monorepo-wide transitive dependency management"

# Metrics
duration: 54min
completed: 2026-02-17
---

# Phase 12 Plan 02: Stub Removal and Dependency Security Summary

**Removed stub endpoints (GET /, GET /api/users/me), added X-Frame-Options header, remediated all HIGH dependency vulnerabilities via upgrades and pnpm.overrides**

## Performance

- **Duration:** 54 min
- **Started:** 2026-02-17T00:20:31Z
- **Completed:** 2026-02-17T01:15:22Z
- **Tasks:** 2
- **Files modified:** 16 (10 deleted, 6 modified)

## Accomplishments
- Removed 7 stub/debug files (AppController, AppService, UsersController, UsersModule, all associated tests)
- Cleaned app.module.ts to no longer reference deleted modules
- Added X-Frame-Options: SAMEORIGIN as defense-in-depth for legacy browsers
- Upgraded fastify to 5.7.4 (fixes content-type tab bypass HIGH vuln)
- Upgraded axios to 1.13.5+ (fixes __proto__ DoS HIGH vuln)
- Added 7 pnpm.overrides for transitive vulnerability remediation
- Reduced audit findings from 13 vulnerabilities (3 HIGH) to 2 moderate (dev-only)

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove stub endpoints and clean app module** - `78aec7a` (fix)
2. **Task 2: Security headers, dependency audit, and debug code scan** - `751ccdc` (chore)

## Files Created/Modified

### Deleted
- `apps/api/src/app.controller.ts` - Stub GET / endpoint returning "Hello World!"
- `apps/api/src/app.service.ts` - Service backing deleted controller
- `apps/api/src/app.controller.unit.test.ts` - Test for deleted controller
- `apps/api/src/__tests__/app.service.unit.test.ts` - Test for deleted service
- `apps/api/src/users/users.controller.ts` - Stub GET /api/users/me with hardcoded data
- `apps/api/src/users/users.module.ts` - Module for deleted controller
- `apps/api/src/users/__tests__/users.controller.unit.test.ts` - Test for deleted controller
- `apps/api/test/app.e2e.test.ts` - E2E test for deleted GET / endpoint

### Modified
- `apps/api/src/app.module.ts` - Removed AppController, AppService, UsersModule references
- `apps/api/test/session-guard.e2e.test.ts` - Removed GET / public endpoint test
- `apps/api/src/main.ts` - Added X-Frame-Options: SAMEORIGIN header
- `package.json` - Added pnpm.overrides for 7 transitive dependencies
- `apps/api/package.json` - fastify and axios version bumps
- `apps/web/package.json` - axios version bump
- `apps/worker/package.json` - fastify version bump
- `packages/backend-shared/package.json` - fastify and axios version bumps

## Decisions Made

- **pnpm.overrides for transitive dependency management:** Used root-level pnpm.overrides to pin fastify (>=5.7.2), axios (>=1.13.5), @isaacs/brace-expansion (>=5.0.1), qs (>=6.14.2), webpack (>=5.104.1), lodash (>=4.17.23), diff (>=4.0.4). This ensures transitive dependencies pulled by @nestjs/platform-fastify, @nestjs/config, jest/ts-node, and other intermediate packages are also patched.
- **esbuild moderate vulnerability accepted:** 2 moderate esbuild vulnerabilities remain (dev-only, via vitest -> vite@5 -> esbuild@0.21.5). Cannot override without breaking vite@5's internal esbuild usage. Root devDependency already has esbuild@0.25.12 for direct usage. Dev-only toolchain, no production impact.
- **X-Frame-Options: SAMEORIGIN:** Added as defense-in-depth alongside existing CSP frame-ancestors directive. Modern browsers ignore X-Frame-Options when CSP frame-ancestors is present, but legacy browsers (IE11) honor it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Deleted app.e2e.test.ts that tested deleted controller**
- **Found during:** Task 1 (Stub endpoint removal)
- **Issue:** `apps/api/test/app.e2e.test.ts` tests the deleted AppController `GET /` endpoint; would fail without the controller
- **Fix:** Deleted the entire test file since it exclusively tests deleted functionality
- **Verification:** `pnpm --filter api test` passes with 395 tests
- **Committed in:** 78aec7a (Task 1 commit)

**2. [Rule 3 - Blocking] Updated session-guard E2E test to remove GET / assertion**
- **Found during:** Task 1 (Stub endpoint removal)
- **Issue:** `apps/api/test/session-guard.e2e.test.ts` had a "should allow GET / without session" test expecting "Hello World!" response
- **Fix:** Removed the test case since GET / no longer exists
- **Verification:** E2E test file compiles and remaining tests are unaffected
- **Committed in:** 78aec7a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary to prevent broken tests from deleted code. No scope creep.

## Debug Code Scan Results

### TODOs Found
- `apps/api/test/query-execution-flow.e2e.test.ts:1180` - "TODO: This test hangs when creating 10 concurrent runs" (known test limitation, deferred)
- `apps/web/src/.../autocomplete-integration.test.ts:273` - "TODO: Once negative conditions are added" (future feature enhancement, deferred)
- Neither references Phase 12 or debug stubs.

### console.log in Source Code
- `apps/web/src/.../use-sql-diagnostics.ts:33` - `console.log('[SQL-DIAG]')` in source code. This is a diagnostic utility, not a debug stub. Pre-existing, out of scope for this plan.
- All other `console.log` instances are in test files (global-setup.ts, sql-parser-spike.test.ts) - acceptable.

### Hardcoded Test Values
- All `user@example.com` occurrences are in test files only. The `stub-user-id`/`stub-tenant-id` values in UsersController were eliminated by deletion.

### Development-only Routes
- No development-only routes or middleware found. The only NODE_ENV check is the throttler test-mode limit (correct behavior).

## Pre-existing Issues (Not from Plan 02)

- **Auth controller typecheck errors:** 2 type errors in `auth.controller.unit.test.ts` from uncommitted Phase 12 Plan 01 session security work (logout method signature change). Not caused by Plan 02 changes.
- **Flaky api-error-handling web test:** 2 tests fail intermittently in full suite but pass in isolation (timing/ordering issue). Pre-existing.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Attack surface cleaned: no stub endpoints, no hardcoded test data in source
- Security headers complete (X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, CSP, HSTS)
- Dependency audit clean (0 HIGH vulnerabilities)
- Ready for Plan 03 (remaining Phase 12 security baseline work)

---
*Phase: 12-security-baseline*
*Completed: 2026-02-17*
