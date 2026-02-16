---
phase: 10-observability-monitoring
plan: 04
subsystem: infra
tags: [prometheus, metrics, prom-client, bullmq-otel, distributed-tracing, runbooks, observability]

requires:
  - phase: 10-01-sentry-error-tracking
    provides: Sentry SDK, OpenTelemetry auto-instrumentation, all Phase 10 npm deps installed

provides:
  - API /metrics Prometheus scrape endpoint with business and infrastructure metrics
  - Business metrics: qpp_queries_executed_total, qpp_mce_api_calls_total, qpp_query_duration_seconds
  - Default Node.js metrics (event loop lag, GC, CPU) via collectDefaultMetrics with qpp_ prefix
  - BullMQ trace propagation via bullmq-otel in both API and Worker
  - 4 operational runbooks for common alert scenarios

affects: [api-hardening, security-baseline, deployment]

tech-stack:
  added: []
  patterns: ["API MetricsModule @Global() with injectable metric providers", "collectDefaultMetrics in onModuleInit lifecycle hook", "BullMQOtel telemetry option in BullModule.forRootAsync"]

key-files:
  created:
    - apps/api/src/observability/metrics/metrics.controller.ts
    - apps/api/src/observability/metrics/metrics.module.ts
    - docs/runbooks/mce-timeout-spikes.md
    - docs/runbooks/queue-backlog.md
    - docs/runbooks/db-pool-exhaustion.md
    - docs/runbooks/redis-connectivity-loss.md
  modified: []

key-decisions:
  - "import type for FastifyReply in MetricsController (isolatedModules + emitDecoratorMetadata requires it)"
  - "BullMQ telemetry IS supported by @nestjs/bullmq through Bull.QueueOptions.telemetry; wired directly"
  - "ObservabilityModule and BullMQOtel already committed by Plan 02 Task 1; Plan 04 only adds MetricsModule files"
  - "Runbooks force-added via git add -f (docs/ directory is gitignored for auto-generated docs)"

patterns-established:
  - "Injectable metric providers: use @Inject('QPP_QUERIES_EXECUTED') pattern for business metric counters"
  - "Runbook structure: Alert Trigger, Severity, Symptoms, Likely Causes, Diagnosis Steps, Resolution Steps, Escalation, Prevention"

duration: 24min
completed: 2026-02-16
---

# Phase 10 Plan 04: API Metrics, BullMQ Tracing & Operational Runbooks Summary

**API Prometheus /metrics endpoint with 3 business metrics and default Node.js metrics, BullMQ trace propagation via bullmq-otel, and 4 operational runbooks for MCE/queue/DB/Redis alert scenarios**

## Performance

- **Duration:** 24 min
- **Started:** 2026-02-16T00:09:12Z
- **Completed:** 2026-02-16T00:34:01Z
- **Tasks:** 2/2
- **Files modified:** 6 created

## Accomplishments

- API /metrics endpoint returns Prometheus-formatted text with qpp_* business metrics and default Node.js metrics (event loop, GC, CPU)
- BullMQ trace propagation wired via `telemetry: new BullMQOtel('qpp-api')` and `telemetry: new BullMQOtel('qpp-worker')` in both app modules (committed by Plan 02 Task 1, verified here)
- 4 operational runbooks with project-specific diagnosis commands referencing Bull Board, Phase 1.7 MCE_TIMEOUTS, RLS patterns, and qpp_* metrics
- Zero test regressions: 386 API + 246 Worker + 2146 Web tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create API MetricsModule and wire BullMQ trace propagation** - `1eb4dbd` (feat)
2. **Task 2: Create operational runbooks** - `1579362` (docs)

## Files Created/Modified

- `apps/api/src/observability/metrics/metrics.controller.ts` - Prometheus scrape endpoint at /metrics using prom-client register
- `apps/api/src/observability/metrics/metrics.module.ts` - @Global() MetricsModule with 3 business metric providers and collectDefaultMetrics
- `docs/runbooks/mce-timeout-spikes.md` - Runbook for MCE SOAP/REST timeout alerts with Trust Site and Sentry diagnosis
- `docs/runbooks/queue-backlog.md` - Runbook for BullMQ queue depth alerts with Bull Board and worker diagnostics
- `docs/runbooks/db-pool-exhaustion.md` - Runbook for PostgreSQL pool exhaustion with pg_stat_activity queries
- `docs/runbooks/redis-connectivity-loss.md` - Runbook for Redis connectivity loss with memory and connection diagnostics

## Decisions Made

- **import type for FastifyReply**: Same TS1272 pattern as Plan 01's GlobalExceptionFilter fix. TypeScript `isolatedModules + emitDecoratorMetadata` requires types used in decorated method signatures to use `import type`.
- **BullMQ telemetry IS supported**: Investigated the `@nestjs/bullmq` types. `BullRootModuleOptions extends Bull.QueueOptions` which includes `telemetry?: Telemetry`. The `bullmq-otel` `BullMQOtel` class implements the `Telemetry` interface. Wired directly in BullModule.forRootAsync useFactory.
- **Plan 02 already committed BullMQOtel + ObservabilityModule**: An earlier execution (commit `713c065`) created the ObservabilityModule with both HealthModule and MetricsModule imports, and wired BullMQOtel in both app modules. Plan 04 only needed to create the actual MetricsModule files.
- **Runbooks force-added**: The `/docs/` directory is gitignored (for auto-generated docs). Operational runbooks are hand-crafted documentation, so `git add -f` was used to bypass the gitignore rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TS1272 error with FastifyReply in MetricsController**
- **Found during:** Task 1 (MetricsController creation)
- **Issue:** Same `isolatedModules + emitDecoratorMetadata` issue as Plan 01. `FastifyReply` used in `@Res() res: FastifyReply` decorated parameter must use `import type`.
- **Fix:** Changed `import { FastifyReply }` to `import type { FastifyReply }` in metrics.controller.ts
- **Files modified:** `apps/api/src/observability/metrics/metrics.controller.ts`
- **Verification:** `pnpm --filter api typecheck` passes
- **Committed in:** `1eb4dbd` (Task 1 commit)

**2. [Rule 3 - Blocking] ObservabilityModule and BullMQOtel already committed by Plan 02**
- **Found during:** Task 1 (ObservabilityModule creation)
- **Issue:** Plan 04 assumed ObservabilityModule and BullMQOtel wiring needed to be created. Commit `713c065` (Plan 02 Task 1) had already created ObservabilityModule with both HealthModule and MetricsModule imports, and wired BullMQOtel telemetry in both app modules.
- **Fix:** Skipped creating ObservabilityModule and modifying app.module.ts files; only created the MetricsModule files that were still missing.
- **Files modified:** None (existing files unchanged)
- **Verification:** `git show HEAD:apps/api/src/observability/observability.module.ts` confirms MetricsModule already imported

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary for TypeScript compilation and avoiding duplicate work. No scope creep.

## Issues Encountered

- **Pre-existing backend-shared build failure**: The committed `logger.module.unit.test.ts` references `AUTO_LOGGING_EXCLUDED_PATHS` which does not exist in the committed `logger.module.ts`. This is a gap from Plan 02's partial execution (Task 1 committed test updates for code that Task 2 was supposed to create). Does not affect API or Worker typecheck/tests, only the `pnpm typecheck` aggregate command via `pnpm -r --filter "./packages/**" build`.

## User Setup Required

None - no external service configuration required. Metrics endpoint is available at `/metrics` when the API is running. Business metric counters are registered but require instrumentation calls at usage sites (e.g., `@Inject('QPP_QUERIES_EXECUTED')` in services) to start recording values.

## Next Phase Readiness

- API /metrics endpoint ready for Grafana/Prometheus scraping
- Business metric tokens (`QPP_QUERIES_EXECUTED`, `QPP_MCE_API_CALLS`, `QPP_QUERY_DURATION`) available for injection across API via @Global() module
- BullMQ trace propagation active; API request spans will link to Worker job spans in Sentry
- Plan 02 Task 2 (Worker health refactoring + pino-loki) still pending
- Phase 10 will be complete once Plan 02 Task 2 executes

## Self-Check: PASSED

All 6 key files verified present. Both task commits (1eb4dbd, 1579362) confirmed in git log. SUMMARY.md created.

---
*Phase: 10-observability-monitoring*
*Completed: 2026-02-16*
