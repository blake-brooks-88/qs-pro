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

## Preview Mode (Build-time fixture mode, no API required)

Preview mode is a Vite `--mode preview` build/dev profile that:

- Renders the editor workspace with a local sample tenant/session (no MCE login flow)
- Uses the local sample catalog (folders, Data Extensions, fields, and rows)
- Makes no `/api/*` calls (API does not need to be running)
- Keeps preview-only imports/fixtures out of the normal production import graph via Vite alias swapping

Run:

`pnpm dev:preview`

Disable:

- Run the normal dev server: `pnpm --filter @qs-pro/web dev`

Preview catalog:

- Preview metadata is sourced from `apps/web/src/preview/fixtures/preview-catalog.json`.
