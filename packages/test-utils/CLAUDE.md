# packages/test-utils

Shared test factories, stubs, and MSW handlers for unit and integration tests.

## What This Package Provides

- **Factories:** `createMockUserSession()`, `createMockShellQueryContext()`, `createMockShellQueryRun()`
- **Stubs:** `createMceBridgeStub()`, `createDatabaseStub()`, `createRedisStub()`, `createMetricsStub()`
- **MSW handlers:** Pre-configured Mock Service Worker handlers for MCE/API endpoints

## Gotchas

- **Source-only package:** `main` points to `src/index.ts` — not built, consumed as TypeScript source.
- **Vitest peer dependency:** Consuming package must have Vitest installed (stubs use `vi.fn()`).
- **Stub maintenance:** Stubs must match actual service interfaces. Breaking changes to services require stub updates.
