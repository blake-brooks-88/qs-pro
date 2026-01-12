# `apps/web` — Frontend Standards

This app is a Vite + React frontend for QS Pro.

## Data Access Standards

### 1) Use TanStack Query for server state

- All server state (fetching/caching/retries/loading/error) goes through TanStack Query.
- Prefer feature-scoped hooks: `useXyz()` in `apps/web/src/features/<feature>/hooks/`.
- Hooks own:
  - request execution (calling the API client)
  - response mapping/normalization
  - query keys (exported constants)
  - caching/staleTime/gcTime decisions

### 2) Use a single API client (no ad-hoc `fetch`/`axios`)

- Use `apps/web/src/services/api.ts` for all API calls.
- Do not call `fetch()` or raw `axios` in components/hooks (except in tests/mocks).
- API calls should be defined in small, feature-oriented service modules and imported into hooks.

### 3) Keep UI components pure

- UI components should receive data + callbacks; they should not own HTTP details.
- Pages wire together hooks + components.

## Backend Layering Expectations (Frontend View)

The API follows a controller/service/repository approach:

- Controllers validate input + shape responses.
- Services implement business logic and orchestration.
- Repositories encapsulate DB access behind interfaces.

For the canonical standard (and migration guidance for older code paths), see:
`agent-os/standards/data-access.md`.

## Preview Mode (Local UI without MCE login)

When you don’t have access to an MCE org, the frontend can run in a dev-only preview mode that:

- Renders the editor workspace without an authenticated session
- Uses local metadata fixtures for Data Extensions + Data Views
- Does **not** change any backend auth/security behavior

Run:

`VITE_PREVIEW_MODE=1 pnpm --filter @qs-pro/web dev`

Disable:

- Unset `VITE_PREVIEW_MODE` (or set it to something other than `1`)
