# Task Breakdown: Data Access Standardization

## Overview
Total Tasks: 3

## Task List

### Web Layer

#### Task Group 1: Standardize Web API Access
**Dependencies:** None

- [x] 1.0 Complete web HTTP standardization
  - [x] 1.1 Update 2-6 focused web tests for refactors
    - Update existing hook tests that currently stub `fetch` to instead mock the shared client/services
    - Target tests: `apps/web/src/hooks/__tests__/use-tenant-features.test.tsx`, `apps/web/src/features/editor-workspace/hooks/use-metadata.test.tsx`
    - Optionally update `apps/web/src/features/verification/VerificationPage.test.tsx` if the verification page is refactored
    - Preferred mocking strategy:
      - Hook tests should mock feature service modules (`apps/web/src/services/*.ts`), not the raw HTTP layer.
      - Service module tests (if added) may mock `apps/web/src/services/api.ts`.
  - [x] 1.2 Make `apps/web/src/services/api.ts` the single HTTP client
    - Set axios instance default `withCredentials: true` for same-origin `/api/*` calls (in the shared client instance, not global axios)
    - Keep any auth refresh behavior intact, but do not introduce `x-csrf-token` behavior yet
  - [x] 1.3 Add feature service modules returning raw API DTOs
    - Add `apps/web/src/services/auth.ts` (e.g., `getMe`, `loginWithJwt`, and any auth bootstrap helpers used by `App.tsx`)
    - Add `apps/web/src/services/features.ts` (e.g., `getTenantFeatures`)
    - Add `apps/web/src/services/metadata.ts` (e.g., `getFolders`, `getDataExtensions`, `getFields`)
    - Services must use the shared client and return server shapes only (no UI mapping)
  - [x] 1.4 Refactor hooks/components to call service modules only
    - Replace `fetch()` usage in `apps/web/src/hooks/use-tenant-features.ts` with `services/features.ts`
    - Replace `fetch()` usage in `apps/web/src/features/editor-workspace/hooks/use-metadata.ts` with `services/metadata.ts` while keeping mapping in the hook
    - Replace raw `axios` usage in `apps/web/src/App.tsx` with `services/auth.ts` (which uses `apps/web/src/services/api.ts`)
    - Keep any dev-only verification tooling isolated to `apps/web/src/features/verification/*`; prefer updating it to use the shared client/services
  - [x] 1.5 Run only the impacted web tests
    - Run `pnpm --filter @qs-pro/web test` (or the narrowest equivalent) and ensure the updated tests from 1.1 pass

**Acceptance Criteria:**
- No production hooks/components use ad-hoc `fetch()` or raw `axios`; HTTP routes through `apps/web/src/services/api.ts`
- Shared client sends cookies reliably for same-origin `/api/*` calls
- Service modules return raw DTOs; hooks own mapping/normalization
- Updated focused web tests pass

### API Layer

#### Task Group 2: Shell-Query Layering (Repository + SSE Provider)
**Dependencies:** Task Group 1 not required

- [x] 2.0 Standardize shell-query module boundaries
  - [x] 2.1 Write 2-6 focused API unit tests for the refactor
    - Add tests for the new SSE orchestration provider/service (rate limit keying, subscribe/unsubscribe lifecycle, decrement on finalize)
    - Add tests for the new repository contract usage in `ShellQueryService` (mock repository, assert orchestration calls)
    - Keep tests narrow; do not add broad e2e coverage as part of this change
  - [x] 2.2 Introduce a shell-query run repository interface (API-local)
    - Add interface in `apps/api/src/shell-query/` (API-owned) for shell-query DB access
    - Define minimal methods needed by `ShellQueryService` (create run, get run, cancel/update status, count active runs)
  - [x] 2.3 Implement a Drizzle-backed repository and inject via Nest token
    - Implement repository using Drizzle + `shellQueryRuns` table
    - Provide/inject using token pattern aligned with existing modules (e.g. `provide: 'SHELL_QUERY_RUN_REPOSITORY'` + `useFactory` + inject `DATABASE`)
    - Preserve RLS context requirements: repository must use the request-scoped DB injection path (already bound to RLS context) and must not create new DB clients/pools
  - [x] 2.4 Move SSE orchestration into a dedicated provider/service
    - Create a service/provider that:
      - Enforces the per-user SSE connection limit
      - Manages Redis duplicate + subscribe/unsubscribe lifecycle
      - Converts pubsub messages to an RxJS `Observable` for SSE
    - Keep stable:
      - limit key: `sse-limit:${user.userId}`
      - limit value: `5`
      - channel: `run-status:${runId}`
      - route shape: `GET /api/runs/:runId/events`
    - Controller must not call Redis connection/rate-limit primitives directly (`incr/expire/decr/duplicate/subscribe`)
  - [x] 2.5 Refactor controller/service to be thin and layered
    - `ShellQueryController`: keep request parsing/validation, ownership check, and delegate orchestration to services
    - `ShellQueryService`: business logic only; no direct Drizzle access and no `db: any`
  - [x] 2.6 Run only the impacted API tests
    - Run `pnpm --filter api test` (or the narrowest equivalent) and ensure the tests from 2.1 pass

**Acceptance Criteria:**
- `apps/api/src/shell-query/` follows controller/service/repository/provider boundaries consistent with auth/features
- No direct Drizzle access or `db: any` remains in `ShellQueryService`
- SSE orchestration logic lives outside the controller and preserves stable keys/limits/channels/routes
- Updated focused API tests pass

### Verification

#### Task Group 3: Definition-of-Done Checks
**Dependencies:** Task Groups 1-2

- [x] 3.0 Verify standardization and scope constraints
  - [x] 3.1 Confirm web codebase has no production ad-hoc HTTP calls
    - Ensure `fetch()` and raw `axios` usage are removed from production hooks/components, except clearly isolated dev-only tooling if retained
    - Suggested checks:
      - `rg -n "fetch\\(" apps/web/src`
      - `rg -n "from \\\"axios\\\"|import axios\" apps/web/src`
    - Remaining matches should be limited to `apps/web/src/services/api.ts` and `apps/web/src/features/verification/*` (if retained)
  - [x] 3.2 Confirm no contract changes
    - Verify shell-query endpoint shapes/status codes are unchanged (especially SSE route)
  - [x] 3.3 Confirm no CSRF “contract” was introduced on the client
    - Ensure no automatic `x-csrf-token` behavior was added absent a backend contract

**Acceptance Criteria:**
- Matches the “Definition of done” in `agent-os/specs/2026-01-09-data-access-standardization/planning/requirements.md`
- No out-of-scope changes were introduced
