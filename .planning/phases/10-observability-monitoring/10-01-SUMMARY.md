---
phase: 10-observability-monitoring
plan: 01
subsystem: infra
tags: [sentry, opentelemetry, error-tracking, distributed-tracing, observability, nestjs]

requires:
  - phase: 01-backend-consolidation
    provides: GlobalExceptionFilter with RFC 9457 Problem Details, Pino structured logging
  - phase: 01.1-logging-standardization
    provides: LoggerModule with nestjs-pino, auto-skip health from request logging

provides:
  - Sentry SDK initialization for API and Worker (instrument.ts)
  - OpenTelemetry auto-instrumentation for pg, ioredis, HTTP, Fastify routes
  - Real @SentryExceptionCaptured decorator on GlobalExceptionFilter
  - Sensitive data scrubbing (headers, tokens, passwords) before Sentry transmission
  - Health/metrics transaction filtering from Sentry traces
  - Optional SENTRY_DSN, SENTRY_ENVIRONMENT, LOKI_HOST/USERNAME/PASSWORD env vars
  - All Phase 10 npm dependencies installed across monorepo

affects: [10-02-health-metrics, 10-03-log-aggregation, 10-04-frontend-sentry, api-hardening, security-baseline]

tech-stack:
  added: ["@sentry/nestjs", "@sentry/react", "@sentry/vite-plugin", "@nestjs/terminus", "bullmq-otel", "pino-loki", "prom-client (api)"]
  patterns: ["instrument.ts first-import pattern for OTel monkey-patching", "@SentryExceptionCaptured decorator on exception filters", "observabilitySchema merged into env schemas"]

key-files:
  created:
    - apps/api/src/instrument.ts
    - apps/worker/src/instrument.ts
  modified:
    - apps/api/src/main.ts
    - apps/worker/src/main.ts
    - apps/api/src/app.module.ts
    - apps/worker/src/app.module.ts
    - apps/api/src/common/filters/global-exception.filter.ts
    - packages/backend-shared/src/config/env.schema.ts

key-decisions:
  - "Separate type imports for ArgumentsHost in GlobalExceptionFilter (isolatedModules + emitDecoratorMetadata requires it)"
  - "Worker instrument.ts omits request header scrubbing (Worker does not serve user HTTP requests)"
  - "All Phase 10 deps installed upfront in Plan 01 for subsequent plans"
  - "SentryModule.forRoot() registered as first import in both AppModules"

patterns-established:
  - "instrument.ts first-import: Sentry/OTel must initialize before any module imports for auto-instrumentation"
  - "observabilitySchema: optional env vars merged into both API and Worker schemas"
  - "@SentryExceptionCaptured(): method decorator on exception filter catch(), no manual captureException"

duration: 44min
completed: 2026-02-15
---

# Phase 10 Plan 01: Sentry Error Tracking & Distributed Tracing Summary

**Sentry SDK with OpenTelemetry auto-instrumentation for API and Worker, replacing mock Sentry stub with real @SentryExceptionCaptured decorator and beforeSend scrubbing**

## Performance

- **Duration:** 44 min
- **Started:** 2026-02-15T23:08:41Z
- **Completed:** 2026-02-15T23:53:02Z
- **Tasks:** 2/2
- **Files modified:** 13 (excluding pnpm-lock.yaml)

## Accomplishments

- Sentry SDK initializes before all other imports in both API and Worker via instrument.ts first-import pattern
- 5xx errors flow through @SentryExceptionCaptured decorator to Sentry (when DSN configured)
- Sensitive data scrubbed: authorization, cookie, x-admin-key, x-csrf-token, x-xsrf-token headers; password, token, secret, session, accessToken, refreshToken fields
- Health/metrics transactions filtered from Sentry traces (GET /livez, /readyz, /metrics, /health)
- All Phase 10 npm packages installed for subsequent plans (terminus, bullmq-otel, pino-loki, prom-client, sentry-react, sentry-vite-plugin)
- Zero test regressions (389 API + 246 Worker + 2146 Web tests pass)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, create instrument.ts files, add env vars** - `a30c006` (chore)
2. **Task 2: Wire Sentry into NestJS modules and upgrade GlobalExceptionFilter** - `783e7d2` (feat)

## Files Created/Modified

- `apps/api/src/instrument.ts` - Sentry.init() with beforeSend header/body scrubbing and beforeSendTransaction filtering
- `apps/worker/src/instrument.ts` - Sentry.init() with transaction filtering (no request scrubbing needed)
- `apps/api/src/main.ts` - Added `import './instrument'` as first line
- `apps/worker/src/main.ts` - Added `import './instrument'` as first line
- `apps/api/src/app.module.ts` - Added SentryModule.forRoot() as first import in module
- `apps/worker/src/app.module.ts` - Added SentryModule.forRoot() as first import in module
- `apps/api/src/common/filters/global-exception.filter.ts` - Removed mock Sentry, added @SentryExceptionCaptured decorator, separated type imports
- `packages/backend-shared/src/config/env.schema.ts` - Added observabilitySchema with SENTRY_DSN, SENTRY_ENVIRONMENT, LOKI_HOST/USERNAME/PASSWORD
- `apps/api/package.json` - Added @sentry/nestjs, @nestjs/terminus, bullmq-otel, prom-client, pino-loki
- `apps/worker/package.json` - Added @sentry/nestjs, @nestjs/terminus, bullmq-otel, pino-loki
- `apps/web/package.json` - Added @sentry/react, @sentry/vite-plugin
- `apps/api/src/__tests__/app.module.unit.test.ts` - Increased timeout to 15s (OTel dep tree overhead)
- `apps/worker/src/__tests__/app.module.unit.test.ts` - Increased timeout to 15s (OTel dep tree overhead)

## Decisions Made

- **Separate type imports for ArgumentsHost**: TypeScript `isolatedModules + emitDecoratorMetadata` requires types used in decorated method signatures to use `import type`. Moved `ArgumentsHost` and `ExceptionFilter` to `import type` from `@nestjs/common`.
- **Worker omits request header scrubbing**: Worker does not serve user HTTP requests with auth headers, so beforeSend only filters noisy transactions.
- **All Phase 10 deps installed in Plan 01**: Subsequent plans (health checks, metrics, log aggregation, frontend) can focus on implementation without dependency installation.
- **SentryModule first in imports array**: Ensures Sentry integration hooks register before other NestJS modules.
- **App module test timeout increase**: New OTel packages add ~3-5s to module resolution time during dynamic imports in tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript TS1272 error with @SentryExceptionCaptured decorator**
- **Found during:** Task 2 (GlobalExceptionFilter upgrade)
- **Issue:** `isolatedModules + emitDecoratorMetadata` compiler options require explicit `import type` for types used in decorated method signatures. `ArgumentsHost` (interface) was imported as a regular import alongside value imports.
- **Fix:** Separated imports: `Catch`, `HttpException`, `Logger` as value imports; `ArgumentsHost`, `ExceptionFilter` as `import type`.
- **Files modified:** `apps/api/src/common/filters/global-exception.filter.ts`
- **Verification:** `pnpm typecheck` passes across all packages
- **Committed in:** `783e7d2` (Task 2 commit)

**2. [Rule 3 - Blocking] App module unit tests timing out at 5000ms default**
- **Found during:** Task 1 (dependency installation)
- **Issue:** Installing 68 new packages (OpenTelemetry transitive deps from @sentry/nestjs) increased module resolution time for dynamic `import('../app.module.js')` in tests from ~4s to ~8s, exceeding the 5000ms default timeout.
- **Fix:** Increased test timeout to 15000ms for both API and Worker app.module unit tests.
- **Files modified:** `apps/api/src/__tests__/app.module.unit.test.ts`, `apps/worker/src/__tests__/app.module.unit.test.ts`
- **Verification:** Both tests pass within 15s limit
- **Committed in:** `a30c006` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for TypeScript compilation and test execution. No scope creep.

## Issues Encountered

- Pre-existing web source file modifications (App.tsx, main.tsx, instrument.ts) appeared in working tree during execution, likely from a previous lint-staged stash. These were restored/removed before each commit since they belong to a later plan (frontend Sentry integration).

## User Setup Required

**External services require manual configuration.** Sentry DSN must be configured for error tracking to activate:

- **SENTRY_DSN**: Obtain from Sentry Dashboard -> Settings -> Projects -> Client Keys (DSN)
- **SENTRY_ENVIRONMENT**: Optional, defaults to NODE_ENV at runtime
- Create 3 Sentry projects (qpp-api, qpp-worker, qpp-web) within one organization
- All env vars are optional; dev environments work without any Sentry configuration

## Next Phase Readiness

- Sentry and OTel infrastructure ready for Plan 02 (health checks + metrics)
- @nestjs/terminus installed and ready for /livez + /readyz endpoints
- prom-client installed in API (was already in Worker) for Prometheus metrics
- pino-loki installed for Plan 03 (log aggregation)
- @sentry/react and @sentry/vite-plugin installed for Plan 04 (frontend error tracking)

## Self-Check: PASSED

All 8 key files verified present. Both task commits (a30c006, 783e7d2) confirmed in git log. SUMMARY.md created.

---
*Phase: 10-observability-monitoring*
*Completed: 2026-02-15*
