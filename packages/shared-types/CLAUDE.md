# packages/shared-types

Shared TypeScript types and Zod schemas used by API, web, and worker.

## What This Package Provides

- **DTOs:** Request/response types for all API endpoints (suffixed `Dto` or `Response`)
- **Zod schemas:** Runtime validation schemas (suffixed `Schema`)
- **Feature flags:** `FeatureKey` enum + `TIER_FEATURES` mapping
- **Error codes:** Centralized `ErrorCode` enum and messages
- **Roles:** Role definitions and permission utilities

## Gotchas

- **No cross-package imports:** This package must not import from other `@qpp/*` packages to avoid circular dependencies.
- **Coordinated deploys:** Zod schema changes affect API validation — changes require testing across API, web, and worker.
- **New features:** Must be added to `FeatureKey` enum + `TIER_FEATURES` mapping + tests.
