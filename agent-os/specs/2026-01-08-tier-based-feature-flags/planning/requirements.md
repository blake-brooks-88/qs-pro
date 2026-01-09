# Spec Requirements: Tier-Based Feature Flags

## Initial Description

Implement a Tier-Based Feature Flag System for QS Pro, a Salesforce Marketing Cloud AppExchange ISV app. The system needs to:
- Map to AppExchange pricing tiers (free/pro/enterprise)
- Support per-tenant tier assignment
- Support license seat limits per tier (e.g., Pro = 5 seats, Enterprise = unlimited)
- Enable runtime feature checks in React frontend
- Be database-driven (no external services)

## Requirements Discussion

### First Round Questions

**Q1:** I assume the `feature_definitions` table in the database is primarily for admin visibility/documentation, since you mentioned the tier-to-feature mapping can be a code constant (`TIER_FEATURES`). Is that correct, or should feature resolution actually query the database?
**Answer:** User was unsure of best practice. After discussion, agreed that the **code constant approach** is preferred because:
- No DB query on every feature check (faster)
- Type-safe - TypeScript catches invalid feature keys at compile time
- Atomic deploys - feature changes ship with code, no DB/code sync issues
- Easier testing - no need to seed feature definitions

The `tenant_feature_overrides` table still provides per-tenant exceptions when needed. **Decision: Use code constant for tier-to-feature mapping, NOT a `feature_definitions` table.**

**Q2:** For seat limit enforcement, I assume we should check seat count on user creation (block if over limit) and check seat count on login (allow existing users but warn/log if over limit). Is that the expected behavior, or should we hard-block logins when over limit?
**Answer:** Hard block when over the limit. Return a clear error (e.g., `SEAT_LIMIT_EXCEEDED`) that the frontend can handle with an appropriate message.

**Q3:** The prompt mentions `tenant_feature_overrides` for beta testing/exceptions. I assume overrides can both enable features (give a free-tier tenant access to a pro feature) AND disable features (revoke a feature from a paying tenant, e.g., for abuse). Correct?
**Answer:** Yes, overrides work both ways (enable and disable).

**Q4:** For the frontend, should the `useTenantFeatures` hook refetch features on any particular events (e.g., after a successful upgrade flow), or is app-init + manual invalidation sufficient?
**Answer:** Whatever is industry standard. (App-init with manual invalidation via TanStack Query's `invalidateQueries` is standard practice.)

**Q5:** I assume the `/api/features` endpoint requires authentication and returns features only for the currently authenticated tenant (no tenant ID parameter needed). Correct?
**Answer:** Yes, endpoint requires authentication. Tenant is derived from session/RLS context - no tenant ID parameter needed.

**Q6:** The `FeatureGate` component - when a feature is disabled, should it render nothing, render a "locked" placeholder with upgrade CTA, or accept a `fallback` prop for custom behavior?
**Answer:** Render a locked placeholder with an icon that appears premium and is visually apparent, with hover message saying it's a premium feature and prompting them to upgrade.

**Q7:** Is there anything you explicitly want excluded from this initial implementation?
**Answer:** Yes, out of scope:
- Admin UI for managing tiers/overrides
- Upgrade flow integration
- Analytics on feature usage

### Existing Code to Reference

No similar existing features identified for reference.

**Code Quality Requirements:**
- Must be modular
- Must follow SOLID principles
- Must be DRY (Don't Repeat Yourself)
- Must follow all React best practices

### Follow-up Questions

**Follow-up 1:** For the "locked" placeholder UI - should this be a generic component that works anywhere, or do you envision different locked states for different contexts (locked button, locked panel/section, locked menu item)?
**Answer:** Create CVA (Class Variance Authority) variants for these components:
- Locked **button** (grayed out with lock icon)
- Locked **panel/section** (overlay with upgrade message)
- Locked **menu item** (disabled with premium badge)

**Follow-up 2:** For the upgrade prompt on hover - should it just show a tooltip message or link somewhere?
**Answer:** For now, just show a message prompting to upgrade. Link will be added later.

## Visual Assets

### Files Provided:
No visual assets provided.

### Visual Insights:
N/A

## Requirements Summary

### Functional Requirements

**Database Schema:**
- Add `subscriptionTier` column to tenants table (enum: `free`, `pro`, `enterprise`, default `free`)
- Add `seatLimit` column to tenants table (nullable integer, `null` = unlimited)
- Create `tenant_feature_overrides` table: `tenant_id`, `feature_key`, `enabled` (boolean) for beta testing/exceptions
- **NO `feature_definitions` table** - use code constant instead

**Shared Types (packages/shared-types):**
- Export `SubscriptionTier` enum/union type: `'free' | 'pro' | 'enterprise'`
- Export `FeatureKey` union type (e.g., `'quickFixes' | 'minimap' | 'teamSnippets'`)
- Export `TenantFeatures` type mapping feature keys to booleans
- Export `TIER_FEATURES` constant mapping tiers to feature arrays

**Backend (apps/api):**
- Create `FeaturesModule` with `FeaturesService`
- Endpoint `GET /api/features` returns enabled features for current tenant
- Logic: Check tier → get base features from `TIER_FEATURES` constant → apply overrides from DB
- Enforce seat limits on user creation AND login (hard block with `SEAT_LIMIT_EXCEEDED` error)
- Follow repository pattern per tech stack requirements

**Frontend (apps/web):**
- Create `useTenantFeatures` hook - fetches and caches features via TanStack Query at app init
- Create `useFeature` hook: `const enabled = useFeature('quickFixes')`
- Create `FeatureGate` component with locked state rendering
- Create CVA variants for locked states:
  - `LockedButton` - grayed out with lock icon
  - `LockedPanel` - overlay with upgrade message
  - `LockedMenuItem` - disabled with premium badge
- Locked states show hover tooltip: "Pro feature - Upgrade to unlock" (no link for now)

**Static Feature-to-Tier Mapping:**
```typescript
const TIER_FEATURES: Record<SubscriptionTier, FeatureKey[]> = {
  free: ['basicLinting', 'syntaxHighlighting'],
  pro: ['basicLinting', 'syntaxHighlighting', 'quickFixes', 'minimap', 'advancedAutocomplete'],
  enterprise: ['basicLinting', 'syntaxHighlighting', 'quickFixes', 'minimap', 'advancedAutocomplete', 'teamSnippets', 'auditLogs'],
};
```

**Migration:**
- Use `pnpm db:generate` and `pnpm db:migrate` workflow
- **NEVER manually create migration files** - this breaks the Drizzle journal

### Reusability Opportunities

- No existing similar features to reference
- New code must establish patterns for future feature flag usage throughout the app

### Scope Boundaries

**In Scope:**
- Database schema changes (tenants columns + overrides table)
- Shared types package updates
- Backend FeaturesModule and FeaturesService
- Backend seat limit enforcement
- Frontend hooks (`useTenantFeatures`, `useFeature`)
- Frontend `FeatureGate` component
- Frontend CVA variants for locked UI states (button, panel, menu item)
- Unit tests for FeaturesService tier logic
- Unit tests for useFeature hook
- Integration test: free tier user cannot access pro feature

**Out of Scope:**
- Admin UI for managing tiers/overrides
- Upgrade flow integration (link/redirect to upgrade)
- Analytics on feature usage
- Actually applying feature checks to existing code (infrastructure only)
- Implementing Quick Fixes or other features that will use this system
- External feature flag services (LaunchDarkly, Split, etc.)

### Technical Considerations

- Must follow SOLID principles
- Must be modular and DRY
- Must follow React best practices
- Must follow existing repository pattern (Repository → Service → Controller)
- Must use Drizzle ORM for database access
- Must use TanStack Query for frontend data fetching
- Must use CVA for component variants
- Must use Zod for validation
- RLS policies already in place - leverage existing tenant context
- Features cached at app init, manual invalidation when needed
