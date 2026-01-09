# Specification: Tier-Based Feature Flags

## Goal
Implement a database-driven tier-based feature flag system that maps AppExchange pricing tiers (free/pro/enterprise) to feature access, supports per-tenant overrides, enforces seat limits, and provides React hooks and gated UI components for feature access control.

## User Stories
- As a tenant admin, I want my team's feature access automatically determined by our subscription tier so that we can use the features we paid for without manual configuration
- As a free-tier user, I want to see locked indicators on premium features with upgrade prompts so that I understand what I could access by upgrading

## Specific Requirements

**Database Schema Changes**
- Add `subscription_tier` enum column to tenants table (`free | pro | enterprise`, default `free`)
- Add `seat_limit` nullable integer column to tenants table (`null` = unlimited)
- Create `tenant_feature_overrides` table with `tenant_id` (FK), `feature_key` (varchar), `enabled` (boolean)
- Use composite unique constraint on `(tenant_id, feature_key)` for overrides table
- Follow existing Drizzle schema patterns from `packages/database/src/schema.ts`

**Shared Types Package**
- Define `SubscriptionTier` as union type: `'free' | 'pro' | 'enterprise'`
- Define `FeatureKey` as union type for all feature flags (e.g., `'basicLinting' | 'quickFixes' | 'minimap'`)
- Define `TIER_FEATURES` constant mapping each tier to its feature array (tiers inherit lower tier features)
- Define `TenantFeatures` type as `Record<FeatureKey, boolean>` for API responses
- Use Zod schemas for runtime validation following existing patterns in `packages/shared-types/`

**Backend FeaturesModule**
- Create `FeaturesModule` with `FeaturesService` and `FeaturesController` following NestJS patterns
- Create `FeatureOverrideRepository` implementing repository interface pattern
- `GET /api/features` endpoint returns `TenantFeatures` for authenticated tenant (no tenant ID param needed)
- Feature resolution: get base features from `TIER_FEATURES[tier]` then apply overrides from DB
- Use `@UseGuards(SessionGuard)` and `@CurrentUser()` decorator for tenant context
- Overrides can both enable (beta access) and disable (revocation) features

**Seat Limit Enforcement**
- Add seat count check to user creation flow - block with `SEAT_LIMIT_EXCEEDED` error if over limit
- Add seat count check to login flow - hard block with `SEAT_LIMIT_EXCEEDED` error if over limit
- Frontend must handle `SEAT_LIMIT_EXCEEDED` error response with appropriate messaging
- `null` seat_limit means unlimited users allowed

**Frontend useTenantFeatures Hook**
- Fetch features from `/api/features` on app initialization using TanStack Query
- Use query key factory pattern: `featuresQueryKeys.tenant(tenantId)`
- Configure appropriate `staleTime` and `gcTime` for caching
- Return `{ data: TenantFeatures, isLoading, error, refetch }`
- Manual invalidation via `queryClient.invalidateQueries()` when needed

**Frontend useFeature Hook**
- Simple hook: `const enabled = useFeature('quickFixes')` returns boolean
- Internally uses `useTenantFeatures` to access cached feature data
- Returns `false` while loading (fail-closed approach for security)

**FeatureGate Component**
- Renders children when feature enabled, renders locked state when disabled
- Accept `feature: FeatureKey` prop for type-safe feature checking
- Accept `variant` prop for CVA variants: `'button' | 'panel' | 'menuItem'`
- Locked button: grayed out with lock icon
- Locked panel: overlay with "Upgrade to Pro" message
- Locked menu item: disabled with premium badge
- All locked variants show tooltip on hover: "Pro feature - Upgrade to unlock"

**Testing Requirements**
- Unit tests for `FeaturesService` tier resolution logic (free gets free features, pro gets pro+free features)
- Unit tests for override application (enable, disable, no override scenarios)
- Unit tests for `useFeature` hook (enabled, disabled, loading states)
- Integration test: verify free-tier tenant cannot access pro feature via API

## Existing Code to Leverage

**Drizzle Schema Patterns (`packages/database/src/schema.ts`)**
- Use `pgTable` with UUID primary keys and `defaultRandom()`
- Use `.$type<>()` for TypeScript enum typing on varchar columns
- Use `.references(() => tenants.id)` for foreign key relationships
- Use composite unique constraints for multi-column uniqueness

**NestJS Module Pattern (`apps/api/src/auth/auth.module.ts`)**
- Use `useFactory` with `inject` for repository dependency injection
- Use named tokens like `'FEATURE_OVERRIDE_REPOSITORY'` for DI
- Apply `@UseGuards(SessionGuard)` and `@UseFilters(GlobalExceptionFilter)` at controller level
- Use `@CurrentUser()` decorator to extract `tenantId` from session

**TanStack Query Pattern (`apps/web/src/features/editor-workspace/hooks/use-metadata.ts`)**
- Implement query key factory with `as const` assertions
- Create options factory returning `UseQueryOptions<T, Error>`
- Use `credentials: 'include'` for fetch requests
- Export both options factory and composed hook

**CVA Component Pattern (`apps/web/src/components/ui/button.tsx`)**
- Define variants object with named variant groups
- Use `VariantProps<typeof variants>` for type-safe props
- Use `cn()` utility for className merging
- Use `React.forwardRef` for ref forwarding

**Zustand Auth Store Pattern (`apps/web/src/store/auth-store.ts`)**
- Simple store with state and actions
- Access tenant context from existing `useAuthStore`

## Out of Scope
- Admin UI for managing tiers or feature overrides
- Upgrade flow UI or payment integration
- Analytics or tracking of feature usage
- Billing system integration
- Actually gating existing features with this system (infrastructure only)
- External feature flag services (LaunchDarkly, Split, etc.)
- Automatic tier changes based on payment events
- Feature flag A/B testing or percentage rollouts
- Team/organization-level feature inheritance
- Time-limited trial features or expiration dates
