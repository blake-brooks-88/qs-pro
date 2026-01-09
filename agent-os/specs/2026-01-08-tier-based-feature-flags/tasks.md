# Task Breakdown: Tier-Based Feature Flags

## Overview
Total Tasks: 27 sub-tasks across 5 task groups

## Task List

### Shared Types Layer

#### Task Group 1: Feature Flag Types and Constants
**Dependencies:** None

- [ ] 1.0 Complete shared types for feature flags
  - [ ] 1.1 Define `SubscriptionTier` type and Zod schema
    - Union type: `'free' | 'pro' | 'enterprise'`
    - Create `SubscriptionTierSchema` with Zod enum
    - Export from `packages/shared-types/src/index.ts`
  - [ ] 1.2 Define `FeatureKey` type and feature constants
    - Union type for all feature keys (basicLinting, quickFixes, minimap, advancedAutocomplete, teamSnippets, auditLogs, syntaxHighlighting)
    - Create `TIER_FEATURES` constant mapping tiers to feature arrays
    - Ensure tiers inherit lower tier features (pro includes free, enterprise includes pro)
  - [ ] 1.3 Define `TenantFeatures` response type
    - Type: `Record<FeatureKey, boolean>`
    - Create Zod schema for API response validation
  - [ ] 1.4 Verify types compile correctly
    - Run `pnpm typecheck` on shared-types package
    - Ensure no TypeScript errors

**Acceptance Criteria:**
- All types export from shared-types package
- Zod schemas validate correctly
- TypeScript compilation passes

---

### Database Layer

#### Task Group 2: Schema Changes and Migration
**Dependencies:** Task Group 1

- [ ] 2.0 Complete database schema changes
  - [ ] 2.1 Write 4 focused tests for database layer
    - Test: tenant with subscription_tier column accepts valid enum values
    - Test: tenant_feature_overrides table stores override with FK constraint
    - Test: composite unique constraint prevents duplicate (tenant_id, feature_key) pairs
    - Test: seat_limit nullable column works (null = unlimited)
  - [ ] 2.2 Update tenants table schema in `packages/database/src/schema.ts`
    - Add `subscriptionTier` column: varchar with `.$type<SubscriptionTier>()`, default `'free'`
    - Add `seatLimit` column: nullable integer, null means unlimited
    - Follow existing column naming patterns (camelCase in code, snake_case in DB)
  - [ ] 2.3 Create `tenantFeatureOverrides` table schema
    - Fields: `id` (UUID), `tenantId` (FK to tenants), `featureKey` (varchar), `enabled` (boolean), `createdAt`
    - Composite unique constraint on `(tenantId, featureKey)`
    - Index on `tenantId` for query performance
  - [ ] 2.4 Generate and run migration
    - Run `pnpm db:generate` to create migration file
    - Run `pnpm db:migrate` to apply migration
    - **DO NOT manually create migration files**
  - [ ] 2.5 Create `FeatureOverrideRepository` interface and implementation
    - Interface: `IFeatureOverrideRepository` with `findByTenantId(tenantId: string)` method
    - Implementation: `DrizzleFeatureOverrideRepository` following existing repository patterns
    - Add to `packages/database/src/repositories/`
  - [ ] 2.6 Ensure database layer tests pass
    - Run only the 4 tests written in 2.1
    - Verify migration runs successfully

**Acceptance Criteria:**
- The 4 database tests pass
- Migration applies without errors
- Repository follows existing patterns

---

### API Layer

#### Task Group 3: FeaturesModule and Seat Enforcement
**Dependencies:** Task Group 2

- [ ] 3.0 Complete API layer for features
  - [ ] 3.1 Write 6 focused tests for API layer
    - Test: FeaturesService resolves free tier to free features only
    - Test: FeaturesService resolves pro tier to pro+free features
    - Test: FeaturesService applies enable override (free tenant gets pro feature)
    - Test: FeaturesService applies disable override (pro tenant loses feature)
    - Test: GET /api/features returns 401 when unauthenticated
    - Test: GET /api/features returns correct features for authenticated tenant
  - [ ] 3.2 Create `FeaturesService` in `apps/api/src/features/`
    - Method: `getTenantFeatures(tenantId: string, tier: SubscriptionTier): Promise<TenantFeatures>`
    - Logic: Start with `TIER_FEATURES[tier]`, query overrides, apply enable/disable
    - Inject `FeatureOverrideRepository` via DI token
  - [ ] 3.3 Create `FeaturesController` with GET /api/features endpoint
    - Apply `@UseGuards(SessionGuard)` for authentication
    - Use `@CurrentUser()` decorator to get tenantId
    - Return `TenantFeatures` response
  - [ ] 3.4 Create `FeaturesModule` with proper DI setup
    - Import `DatabaseModule`
    - Provide `FEATURE_OVERRIDE_REPOSITORY` token with `useFactory` pattern
    - Export `FeaturesService` for use in other modules
  - [ ] 3.5 Add seat limit enforcement to auth flow
    - Create `SeatLimitService` with `checkSeatLimit(tenantId: string): Promise<void>`
    - Query tenant's `seatLimit` and current user count
    - Throw `SeatLimitExceededException` with error code `SEAT_LIMIT_EXCEEDED` if over limit
    - Integrate check into user creation flow
    - Integrate check into login flow (hard block)
  - [ ] 3.6 Ensure API layer tests pass
    - Run only the 6 tests written in 3.1
    - Verify all endpoints respond correctly

**Acceptance Criteria:**
- The 6 API tests pass
- Features endpoint requires authentication
- Tier resolution works correctly with overrides
- Seat limit blocks user creation and login when exceeded

---

### Frontend Layer

#### Task Group 4: Hooks and FeatureGate Component
**Dependencies:** Task Group 3

- [ ] 4.0 Complete frontend feature flag infrastructure
  - [ ] 4.1 Write 6 focused tests for frontend hooks and components
    - Test: useTenantFeatures fetches from /api/features on mount
    - Test: useFeature returns true for enabled feature
    - Test: useFeature returns false for disabled feature
    - Test: useFeature returns false while loading (fail-closed)
    - Test: FeatureGate renders children when feature enabled
    - Test: FeatureGate renders locked variant when feature disabled
  - [ ] 4.2 Create `useTenantFeatures` hook in `apps/web/src/hooks/`
    - Use TanStack Query with `featuresQueryKeys.tenant(tenantId)` pattern
    - Fetch from `/api/features` with `credentials: 'include'`
    - Configure `staleTime: 5 * 60 * 1000` (5 minutes)
    - Return `{ data, isLoading, error, refetch }`
  - [ ] 4.3 Create `useFeature` hook
    - Signature: `useFeature(featureKey: FeatureKey): boolean`
    - Internally use `useTenantFeatures` to access cached data
    - Return `false` while loading (fail-closed security)
  - [ ] 4.4 Create FeatureGate component with CVA variants
    - Props: `feature: FeatureKey`, `variant: 'button' | 'panel' | 'menuItem'`, `children`
    - When enabled: render children
    - When disabled: render locked variant based on `variant` prop
  - [ ] 4.5 Implement locked state variants using CVA
    - `button` variant: grayed out with lock icon, disabled state
    - `panel` variant: overlay with "Upgrade to Pro" message, semi-transparent backdrop
    - `menuItem` variant: disabled with premium badge icon
    - All variants: tooltip on hover "Pro feature - Upgrade to unlock"
  - [ ] 4.6 Style locked states following design system
    - Use `bg-coolgray-200` and `text-coolgray-400` for disabled states
    - Use lock icon from existing icon library
    - Use existing Tooltip component for hover message
  - [ ] 4.7 Handle SEAT_LIMIT_EXCEEDED error in frontend
    - Create error handler for `SEAT_LIMIT_EXCEEDED` response
    - Display user-friendly message: "Your organization has reached its seat limit"
    - Show in appropriate context (login/user creation)
  - [ ] 4.8 Ensure frontend tests pass
    - Run only the 6 tests written in 4.1
    - Verify hooks and components work correctly

**Acceptance Criteria:**
- The 6 frontend tests pass
- Hooks fetch and cache features correctly
- FeatureGate renders appropriate locked states
- Seat limit error displays user-friendly message

---

### Integration & Test Review

#### Task Group 5: Test Review & Gap Analysis
**Dependencies:** Task Groups 1-4

- [ ] 5.0 Review existing tests and fill critical gaps
  - [ ] 5.1 Review tests from Task Groups 2-4
    - Review the 4 tests from database layer (Task 2.1)
    - Review the 6 tests from API layer (Task 3.1)
    - Review the 6 tests from frontend layer (Task 4.1)
    - Total existing tests: 16 tests
  - [ ] 5.2 Analyze test coverage gaps for feature flags
    - Identify critical end-to-end workflows lacking coverage
    - Focus only on feature flag system, not entire application
    - Prioritize integration points between layers
  - [ ] 5.3 Write up to 6 additional strategic tests
    - Integration test: free-tier tenant API call returns only free features
    - Integration test: pro-tier tenant with disable override loses feature
    - Integration test: override enable gives free tenant access to pro feature
    - Test: TIER_FEATURES constant has correct inheritance (pro includes free features)
    - Test: FeatureGate with each CVA variant renders correctly
    - Test: Seat limit check integrates correctly with login flow
  - [ ] 5.4 Run all feature-specific tests
    - Run only tests related to tier-based feature flags
    - Expected total: approximately 22 tests
    - Verify all tests pass
    - Do NOT run entire application test suite

**Acceptance Criteria:**
- All 22 feature-specific tests pass
- Critical integration points covered
- No more than 6 additional tests added
- Feature flag system works end-to-end

---

## Execution Order

Recommended implementation sequence:

1. **Shared Types Layer (Task Group 1)** - Foundation types and constants needed by all other layers
2. **Database Layer (Task Group 2)** - Schema changes and repository for data persistence
3. **API Layer (Task Group 3)** - Backend service, controller, and seat enforcement
4. **Frontend Layer (Task Group 4)** - Hooks, FeatureGate component, and error handling
5. **Integration & Test Review (Task Group 5)** - Final verification and gap analysis

## Notes

- **Migrations**: Always use `pnpm db:generate` and `pnpm db:migrate` - never create migration files manually
- **Code Constant Approach**: Feature-to-tier mapping is in code (`TIER_FEATURES`), not database, for type safety and atomic deploys
- **Fail-Closed Security**: Frontend returns `false` for features while loading to prevent unauthorized access
- **RLS Integration**: Leverage existing row-level security - tenant context flows through from session
