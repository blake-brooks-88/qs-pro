---
phase: 14-monetization
plan: 01
subsystem: database
tags: [drizzle, postgres, stripe, zod, rls, billing]

# Dependency graph
requires:
  - phase: 05-usage-quotas
    provides: tier enforcement infrastructure (FeaturesService, TIER_FEATURES, subscriptionTier column)
provides:
  - org_subscriptions table with tenant-level subscription state
  - stripe_webhook_events table for idempotent webhook processing
  - IOrgSubscriptionRepository and IStripeWebhookEventRepository interfaces
  - DrizzleOrgSubscriptionRepository with findByTenantId, findByStripeCustomerId, upsert, insertIfNotExists, updateTierByTenantId, updateFromWebhook
  - DrizzleStripeWebhookEventRepository with markProcessing (unique violation guard), markCompleted, markFailed
  - Stripe env var validation (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET) in apiEnvSchema
  - TrialStateSchema and extended TenantFeaturesResponseSchema with trial field
  - SUBSCRIPTION_AUDIT_EVENTS constant
  - Data migration populating org_subscriptions from existing tenants
affects: [14-02 billing-module, 14-03 trial-lifecycle, 14-04 features-refactor]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "org-level subscription table with tenant FK and unique constraint"
    - "system-level table (stripe_webhook_events) intentionally without RLS"
    - "unique violation (23505) catch pattern for idempotent inserts"
    - "insertIfNotExists using ON CONFLICT DO NOTHING for race-safe operations"

key-files:
  created:
    - packages/database/drizzle/0029_shiny_moonstone.sql
    - packages/database/drizzle/0030_rls_org_subscriptions.sql
    - packages/database/drizzle/0031_migrate_existing_tenants.sql
  modified:
    - packages/database/src/schema.ts
    - packages/database/src/interfaces/index.ts
    - packages/database/src/repositories/drizzle-repositories.ts
    - packages/backend-shared/src/config/env.schema.ts
    - packages/shared-types/src/features.ts
    - packages/shared-types/src/index.ts
    - apps/api/src/features/features.service.ts

key-decisions:
  - "stripe_webhook_events intentionally non-RLS: system-level idempotency table accessed by webhook handler outside tenant context"
  - "org_subscriptions uses tenant-only RLS (no mid column) since subscriptions are org-level"
  - "Stripe env vars optional in schema to avoid breaking existing dev environments"
  - "TenantFeaturesResponse extended with nullable trial field for backward compatibility"

patterns-established:
  - "System-level tables: tables without tenant_id skip RLS by design (e.g., stripe_webhook_events)"
  - "Race-safe inserts: insertIfNotExists using ON CONFLICT DO NOTHING + returning length check"
  - "Unique violation guard: catch PostgreSQL error code 23505 for idempotent operations"

# Metrics
duration: 20min
completed: 2026-02-21
---

# Phase 14 Plan 01: Database Foundation Summary

**org_subscriptions and stripe_webhook_events tables with Drizzle repositories, Stripe env validation, TrialState schema, and tenant data migration**

## Performance

- **Duration:** 20 min
- **Started:** 2026-02-21T17:42:38Z
- **Completed:** 2026-02-21T18:02:46Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- org_subscriptions table with tenant FK, Stripe fields, tier, seat limit, trial/period timestamps, and tenant-only RLS
- stripe_webhook_events table for idempotent webhook processing (system-level, intentionally non-RLS)
- IOrgSubscriptionRepository with 6 methods (including findByStripeCustomerId for webhook handler and insertIfNotExists for race-safe trial activation)
- IStripeWebhookEventRepository with markProcessing (unique violation guard), markCompleted, markFailed
- Stripe env var validation (STRIPE_SECRET_KEY with sk_ prefix, STRIPE_WEBHOOK_SECRET with whsec_ prefix) merged into apiEnvSchema
- TrialStateSchema and extended TenantFeaturesResponseSchema with nullable trial field
- Data migration (0031) populates org_subscriptions from existing tenants

## Task Commits

Each task was committed atomically:

1. **Task 1: Add org_subscriptions and stripe_webhook_events tables with repository** - `4ceb44c` (feat)
2. **Task 2: Add Stripe env vars and extend shared-types with trial state** - `c43392a` (feat)

## Files Created/Modified
- `packages/database/src/schema.ts` - Added orgSubscriptions and stripeWebhookEvents table definitions with Zod schemas
- `packages/database/src/interfaces/index.ts` - Added OrgSubscription, StripeWebhookEvent types and IOrgSubscriptionRepository, IStripeWebhookEventRepository interfaces
- `packages/database/src/repositories/drizzle-repositories.ts` - Added DrizzleOrgSubscriptionRepository and DrizzleStripeWebhookEventRepository implementations
- `packages/database/drizzle/0029_shiny_moonstone.sql` - DDL migration for both new tables
- `packages/database/drizzle/0030_rls_org_subscriptions.sql` - RLS policy for org_subscriptions (tenant-only isolation)
- `packages/database/drizzle/0031_migrate_existing_tenants.sql` - Data migration populating org_subscriptions from tenants
- `packages/backend-shared/src/config/env.schema.ts` - Added stripeSchema and merged into apiEnvSchema
- `packages/backend-shared/src/config/__tests__/env.schema.unit.test.ts` - Added 3 tests for Stripe env var validation
- `packages/shared-types/src/features.ts` - Added TrialStateSchema, extended TenantFeaturesResponseSchema, added SUBSCRIPTION_AUDIT_EVENTS
- `packages/shared-types/src/index.ts` - Exported new types and schemas
- `apps/api/src/features/features.service.ts` - Added trial: null to response (backward-compatible)
- `apps/api/src/features/__tests__/features.controller.unit.test.ts` - Updated mock to include trial field
- `apps/web/src/hooks/__tests__/use-tenant-features.test.tsx` - Updated mock to include trial field

## Decisions Made
- **stripe_webhook_events is intentionally non-RLS:** This table has no tenant_id column by design. It stores Stripe event IDs for idempotency and is only accessed by the webhook handler outside tenant context.
- **org_subscriptions uses tenant-only RLS:** No mid column since subscriptions are org-level, not BU-level. Matches the tenant_feature_overrides pattern from migration 0006.
- **Stripe env vars are optional:** Following the observabilitySchema pattern, both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are optional in the schema so dev environments work without Stripe keys. BillingModule validates at runtime.
- **Removed spurious audit_logs ALTER TABLE from generated migration:** Drizzle detected schema drift and included an unnecessary `ALTER TABLE "audit_logs" ADD PRIMARY KEY ("id")` in the generated migration. Removed to prevent migration failure since the PK already exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added trial: null to FeaturesService response and test mocks**
- **Found during:** Task 2 (extending TenantFeaturesResponseSchema)
- **Issue:** Adding `trial` to TenantFeaturesResponseSchema made it a required field. FeaturesService and tests returned `{ tier, features }` without trial, causing TypeScript errors.
- **Fix:** Added `trial: null` to FeaturesService return value and updated 2 test files with the trial field in mock responses.
- **Files modified:** apps/api/src/features/features.service.ts, apps/api/src/features/__tests__/features.controller.unit.test.ts, apps/web/src/hooks/__tests__/use-tenant-features.test.tsx
- **Verification:** pnpm typecheck passes, all affected tests pass
- **Committed in:** c43392a (Task 2 commit)

**2. [Rule 1 - Bug] Removed spurious audit_logs ALTER TABLE from generated migration**
- **Found during:** Task 1 (generating Drizzle migration)
- **Issue:** drizzle-kit generated `ALTER TABLE "audit_logs" ADD PRIMARY KEY ("id")` in the migration, which would fail since the PK already exists.
- **Fix:** Removed the line from the generated 0029 migration SQL
- **Files modified:** packages/database/drizzle/0029_shiny_moonstone.sql
- **Verification:** pnpm db:migrate applies cleanly
- **Committed in:** 4ceb44c (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Drizzle schema drift detection added a spurious ALTER TABLE for audit_logs PK -- removed manually from generated migration.
- Migration numbering: Plan specified 0031-0034 but actual sequence was 0029-0031 (last existing migration was 0028, not 0030). Adjusted numbering accordingly.

## User Setup Required
None - no external service configuration required. Stripe keys are optional in the env schema.

## Next Phase Readiness
- org_subscriptions table and repository ready for 14-02 (billing module webhook handler)
- stripe_webhook_events table and repository ready for 14-02 (idempotent webhook processing)
- IOrgSubscriptionRepository.findByStripeCustomerId ready for webhook handler's customer.subscription.deleted event
- IOrgSubscriptionRepository.insertIfNotExists ready for 14-03 (trial activation race safety)
- TrialStateSchema ready for 14-03 (trial lifecycle) and 14-04 (features refactor)
- Stripe env vars ready for 14-02 (BillingModule will validate at runtime)
- Existing tenants.subscriptionTier and tenants.seatLimit columns intentionally preserved per plan -- removal deferred to post-refactor cleanup

---
*Phase: 14-monetization*
*Completed: 2026-02-21*
