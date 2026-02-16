---
phase: 10-observability-monitoring
plan: 03
subsystem: ui
tags: [sentry, react, error-tracking, source-maps, vite]

requires:
  - phase: 10-01
    provides: "API Sentry SDK pattern (instrument-first import, env-aware config)"
  - phase: 10-02
    provides: "Worker Sentry SDK pattern (consistent across all apps)"
provides:
  - "Browser Sentry SDK with ErrorBoundary for React rendering error capture"
  - "Source map upload via Sentry Vite plugin for readable production stack traces"
  - "Graceful no-op pattern when Sentry env vars not set"
affects: [web, deployment, ci-cd]

tech-stack:
  added: ["@sentry/react", "@sentry/vite-plugin"]
  patterns: ["instrument-first import for early fetch/XHR instrumentation", "conditional Vite plugin activation via env var check", "ErrorBoundary wrapping authenticated content only"]

key-files:
  created:
    - "apps/web/src/instrument.ts"
  modified:
    - "apps/web/src/main.tsx"
    - "apps/web/src/App.tsx"
    - "apps/web/vite.config.ts"

key-decisions:
  - "Sentry.init in dedicated instrument.ts imported as first line in main.tsx for early instrumentation"
  - "ErrorBoundary wraps only authenticated AppShell content (loading/error/unauth states are simple static content)"
  - "10% trace sampling in production, 100% in development"
  - "Source maps enabled via build.sourcemap: true with conditional Sentry Vite plugin"
  - "SENTRY_AUTH_TOKEN/ORG/PROJECT_WEB are build-time env vars (not VITE_ prefixed)"
  - "filesToDeleteAfterUpload removes source maps from dist after Sentry upload"

patterns-established:
  - "Browser Sentry init pattern: dedicated instrument.ts with env-aware DSN and tracing"
  - "ErrorBoundary fallback pattern: user-friendly error message with auto-report notice and reset button"
  - "Conditional Vite plugin: process.env check with .filter(Boolean) for CI-only activation"

duration: 55min
completed: 2026-02-15
---

# Phase 10 Plan 03: Frontend Sentry Error Tracking Summary

**Browser Sentry SDK with ErrorBoundary crash handling and conditional source map upload via Vite plugin**

## Performance

- **Duration:** 55 min
- **Started:** 2026-02-15T23:08:50Z
- **Completed:** 2026-02-16T00:04:47Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Browser Sentry SDK initialized with tracing integration and env-aware configuration
- ErrorBoundary wraps authenticated app content, catching React rendering errors (including Monaco editor crashes)
- Source maps generated during production builds and conditionally uploaded to Sentry via Vite plugin
- Graceful no-op when VITE_SENTRY_DSN is not set (dev environments work without any Sentry configuration)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create browser instrument.ts + wire into main.tsx and App.tsx** - `07cba40` (feat)
2. **Task 2: Configure @sentry/vite-plugin for source map upload** - `6bbab43` (feat)

## Files Created/Modified
- `apps/web/src/instrument.ts` - Browser Sentry.init with browserTracingIntegration, env-aware DSN and trace sampling
- `apps/web/src/main.tsx` - First-line import of instrument.ts for early fetch/XHR instrumentation
- `apps/web/src/App.tsx` - Sentry.ErrorBoundary wrapping authenticated AppShell content with user-friendly fallback
- `apps/web/vite.config.ts` - sentryVitePlugin for source map upload, build.sourcemap: true, conditional activation

## Decisions Made
- **instrument.ts as first import**: Must be imported before any other modules so Sentry can instrument fetch/XHR early
- **ErrorBoundary scope**: Only wraps authenticated content (AppShell + EditorWorkspace + Toaster). Loading, error, and unauthenticated states are simple static content that won't crash
- **10% trace sampling in production**: Balances observability with performance overhead; errors always captured at 100% (default sampleRate)
- **Build-time env vars not VITE_ prefixed**: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT_WEB consumed by Vite plugin in Node.js context, not exposed to client
- **Source maps deleted after upload**: filesToDeleteAfterUpload prevents serving source maps to end users (no source code exposure)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Build with source maps requires increased Node.js heap size (~4GB) due to large bundle (~4MB + ~13MB source map). Production CI/CD should set NODE_OPTIONS=--max-old-space-size=4096 for builds.

## User Setup Required

**External services require manual configuration.** The following environment variables must be configured:

| Variable | Source | Context |
|----------|--------|---------|
| `VITE_SENTRY_DSN` | Sentry Dashboard -> Settings -> Projects -> qpp-web -> Client Keys (DSN) | Client-side runtime (browser) |
| `SENTRY_AUTH_TOKEN` | Sentry Dashboard -> Settings -> Auth Tokens -> Create New Token | Build-time only (CI/CD) |
| `SENTRY_ORG` | Sentry Dashboard -> Settings -> Organization -> slug | Build-time only (CI/CD) |
| `SENTRY_PROJECT_WEB` | Sentry project name (e.g. qpp-web) | Build-time only (CI/CD) |

**Verification:** Without any env vars, the app runs normally (Sentry is a no-op). With VITE_SENTRY_DSN set, errors appear in the Sentry dashboard.

## Next Phase Readiness
- Frontend error tracking complete, joining API and Worker Sentry SDKs for full-stack observability
- Source map upload ready for CI/CD integration once Sentry project is created
- ErrorBoundary provides user-friendly crash recovery for Monaco editor and React rendering errors

## Self-Check: PASSED

- All 4 key files verified present on disk
- Both task commits (07cba40, 6bbab43) verified in git log
- Typecheck passes across all 9 packages
- Web tests pass (2146 tests, 162 files)
- Build succeeds with source maps generated

---
*Phase: 10-observability-monitoring*
*Completed: 2026-02-15*
