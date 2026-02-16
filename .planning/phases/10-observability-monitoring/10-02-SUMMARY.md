---
phase: 10-observability-monitoring
plan: 02
subsystem: infra
tags: [nestjs-terminus, health-checks, pino-loki, grafana, logging, kubernetes]

# Dependency graph
requires:
  - phase: 10-observability-monitoring plan 01
    provides: Sentry integration, ObservabilityModule structure
provides:
  - /livez and /readyz health endpoints for API and Worker
  - PostgresHealthIndicator, RedisHealthIndicator for API
  - PostgresHealthIndicator, RedisHealthIndicator, BullMQHealthIndicator for Worker
  - pino-loki multi-transport for Grafana Loki log shipping
  - AUTO_LOGGING_EXCLUDED_PATHS for health/metrics noise filtering
affects: [deployment, kubernetes-probes, monitoring-dashboards]

# Tech tracking
tech-stack:
  added: ["@nestjs/terminus 11.0.0 (HealthIndicatorService pattern)", "pino-loki 3.0.0"]
  patterns: [HealthIndicatorService check/up/down pattern, Promise.race timeout pattern, multi-transport pino config]

key-files:
  created:
    - apps/api/src/observability/health/postgres.health.ts
    - apps/api/src/observability/health/redis.health.ts
    - apps/api/src/observability/health/health.controller.ts
    - apps/api/src/observability/health/health.module.ts
    - apps/api/src/observability/observability.module.ts
    - apps/worker/src/health/postgres.health.ts
    - apps/worker/src/health/redis.health.ts
    - apps/worker/src/health/bullmq.health.ts
  modified:
    - apps/worker/src/health/health.controller.ts
    - apps/worker/src/health/health.module.ts
    - packages/backend-shared/src/logger/logger.module.ts
    - packages/backend-shared/src/logger/logger.module.unit.test.ts
    - apps/api/src/app.controller.ts
    - apps/api/src/app.service.ts

key-decisions:
  - "Used HealthIndicatorService (v11 pattern) instead of deprecated HealthIndicator base class"
  - "Worker Postgres health uses SQL_CLIENT (raw postgres) instead of DATABASE (drizzle-orm) to avoid dependency resolution issues"
  - "BullMQ health checks Redis client.status rather than ping to verify queue connectivity"
  - "pino-loki transport activated only via LOKI_HOST env var, keeping dev experience unchanged"

patterns-established:
  - "HealthIndicatorService pattern: inject service, call check(key), return indicator.up()/down()"
  - "500ms Promise.race timeout for all health check operations"
  - "AUTO_LOGGING_EXCLUDED_PATHS Set for noise filtering health/metrics endpoints"

# Metrics
duration: 45min
completed: 2026-02-15
---

# Phase 10 Plan 02: Health & Logging Summary

**Kubernetes-ready /livez and /readyz health endpoints with @nestjs/terminus for API (Postgres+Redis) and Worker (Postgres+Redis+BullMQ), plus pino-loki production log shipping to Grafana Loki**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-15T23:50:00Z
- **Completed:** 2026-02-16T00:37:00Z
- **Tasks:** 2
- **Files modified:** 21

## Accomplishments
- Standardized health endpoints: `/livez` (liveness, empty check) and `/readyz` (readiness, dependency checks) for both API and Worker
- Individual health indicators with 500ms timeouts: PostgresHealthIndicator (SELECT 1), RedisHealthIndicator (PING), BullMQHealthIndicator (client status)
- Removed old `/health` endpoint from API AppController and simplified AppService
- Added pino-loki multi-transport for production log aggregation in Grafana Loki (activated via LOKI_HOST env var)
- Added AUTO_LOGGING_EXCLUDED_PATHS to suppress access log noise from health/metrics endpoints
- Comprehensive test coverage: 4 health controller tests (worker), 26 logger tests (backend-shared) including 6 auto-logging + 6 pino-loki

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API health infrastructure** - `713c065` (feat)
2. **Task 2: Refactor Worker health + update LoggerModule** - `9e4fbdc` (feat)

## Files Created/Modified

### API Health Infrastructure (Task 1)
- `apps/api/src/observability/health/postgres.health.ts` - PostgreSQL health indicator using HealthIndicatorService
- `apps/api/src/observability/health/redis.health.ts` - Redis health indicator via REDIS_CLIENT injection
- `apps/api/src/observability/health/health.controller.ts` - /livez and /readyz endpoints
- `apps/api/src/observability/health/health.module.ts` - TerminusModule + health indicator providers
- `apps/api/src/observability/observability.module.ts` - Aggregates HealthModule + MetricsModule
- `apps/api/src/app.controller.ts` - Removed old /health endpoint
- `apps/api/src/app.service.ts` - Removed checkDatabaseHealth, simplified to getHello only
- `apps/api/src/app.controller.unit.test.ts` - Removed health test
- `apps/api/src/__tests__/app.service.unit.test.ts` - Removed database health tests
- `apps/api/src/__tests__/app.module.unit.test.ts` - Fixed BullMQOtel assertion

### Worker Health Infrastructure (Task 2)
- `apps/worker/src/health/postgres.health.ts` - PostgreSQL health via SQL_CLIENT (raw postgres)
- `apps/worker/src/health/redis.health.ts` - Redis health via BullMQ queue client
- `apps/worker/src/health/bullmq.health.ts` - BullMQ queue connectivity check
- `apps/worker/src/health/health.controller.ts` - Rewritten with /livez and /readyz
- `apps/worker/src/health/health.module.ts` - Rewritten with TerminusModule
- `apps/worker/src/health/__tests__/health.controller.unit.test.ts` - New tests for terminus-based controller
- `apps/worker/src/__tests__/app.module.unit.test.ts` - Fixed BullMQOtel assertion

### Logger Enhancement (Task 2)
- `packages/backend-shared/src/logger/logger.module.ts` - Added AUTO_LOGGING_EXCLUDED_PATHS, buildProductionTransport with pino-loki
- `packages/backend-shared/src/logger/logger.module.unit.test.ts` - Added 12 tests (auto-logging exclusions + pino-loki transport)

## Decisions Made
- **HealthIndicatorService over deprecated HealthIndicator**: terminus v11 deprecates the base class pattern; used the new `check(key)` / `up()` / `down()` API
- **Worker uses SQL_CLIENT instead of DATABASE for health checks**: Worker doesn't have drizzle-orm as a direct dependency; using raw postgres `sql` tagged template avoids the dependency
- **BullMQ health checks client.status**: More reliable than ping for verifying queue connectivity since it checks the underlying ioredis connection state
- **pino-loki activated via LOKI_HOST env var**: Keeps development experience unchanged (pino-pretty), only enables Loki transport when explicitly configured in production

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed pre-existing app.module.unit.test failures (API + Worker)**
- **Found during:** Task 1 and Task 2
- **Issue:** Plan 01's BullMQOtel telemetry field added to BullModule.forRootAsync caused strict `toEqual` assertions to fail
- **Fix:** Changed `expect(result).toEqual({connection:...})` to `expect(result).toEqual(expect.objectContaining({connection:...}))`
- **Files modified:** apps/api/src/__tests__/app.module.unit.test.ts, apps/worker/src/__tests__/app.module.unit.test.ts
- **Verification:** Both tests pass
- **Committed in:** 713c065 (Task 1), 9e4fbdc (Task 2)

**2. [Rule 3 - Blocking] Worker postgres health indicator dependency resolution**
- **Found during:** Task 2
- **Issue:** Worker doesn't have drizzle-orm as a direct dependency; importing `sql` from drizzle-orm caused "Cannot find package" errors in vitest
- **Fix:** Used SQL_CLIENT token (raw postgres Sql type) instead of DATABASE token (drizzle PostgresJsDatabase) for the health check query
- **Files modified:** apps/worker/src/health/postgres.health.ts
- **Verification:** Worker tests pass (244 tests, 12 files)
- **Committed in:** 9e4fbdc (Task 2)

**3. [Rule 1 - Bug] ESLint no-non-null-assertion violations in logger test**
- **Found during:** Task 2
- **Issue:** Array index access with `!` non-null assertion (`targets[0]!.target`) violates ESLint rule
- **Fix:** Created helper functions `lokiTarget()` and `stdoutTarget()` with runtime assertions and type narrowing instead of `!` operator
- **Files modified:** packages/backend-shared/src/logger/logger.module.unit.test.ts
- **Verification:** ESLint passes, all 26 logger tests pass
- **Committed in:** 9e4fbdc (Task 2)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes were necessary for test correctness and build compliance. No scope creep.

## Issues Encountered
- **Lint-staged stash/restore cycle**: The pre-commit hook's lint-staged stashes uncommitted changes, deleting untracked new files and reverting modified files. Required staging all files before commit to prevent data loss.

## User Setup Required
None - no external service configuration required. pino-loki transport is opt-in via LOKI_HOST environment variable.

## Next Phase Readiness
- Health endpoints ready for Kubernetes liveness/readiness probes configuration
- Log shipping infrastructure ready for Grafana Loki setup when LOKI_HOST is configured
- OBS-01 (structured logging) and OBS-04 (health endpoints) requirements satisfied

---
*Phase: 10-observability-monitoring*
*Completed: 2026-02-15*
