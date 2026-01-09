# Feature Initialization

## Raw Idea

Implement Tier-Based Feature Flag System for AppExchange ISV App

### Context
QS Pro is a Salesforce Marketing Cloud AppExchange ISV app. We need a feature flag system that:
- Maps to AppExchange pricing tiers (free/pro/enterprise)
- Supports per-tenant tier assignment
- Supports license seat limits per tier (e.g., Pro = 5 seats, Enterprise = unlimited)
- Enables runtime feature checks in React frontend
- Is database-driven (no external services)

### Current Architecture
- Monorepo: apps/api (NestJS), apps/web (React/Vite), packages/database (Drizzle/PostgreSQL)
- Existing tenants table with id, eid, tssd, installedAt
- Existing users table with tenantId foreign key
- Row-level security via PostgreSQL app.tenant_id context

### Requirements
1. Database Schema Changes (packages/database/src/schema.ts):
   - Add subscriptionTier column to tenants table (enum: free, pro, enterprise, default free)
   - Add seatLimit column to tenants table (nullable integer, null = unlimited)
   - Create feature_definitions table: id, key (unique), name, description, tier_required (enum)
   - Create tenant_feature_overrides table: tenant_id, feature_key, enabled (boolean) — for beta testing/exceptions

2. Shared Types (packages/shared-types):
   - Export SubscriptionTier enum/union type
   - Export FeatureKey union type (e.g., 'quickFixes' | 'minimap' | 'teamSnippets')
   - Export TenantFeatures type mapping feature keys to booleans

3. Backend (apps/api):
   - Create FeaturesModule with FeaturesService
   - Endpoint GET /api/features returns enabled features for current tenant
   - Logic: Check tier → get base features → apply overrides
   - Enforce seat limits on user creation/login

4. Frontend (apps/web):
   - Create useTenantFeatures hook that fetches and caches features via TanStack Query
   - Create FeatureGate component: <FeatureGate feature="quickFixes">{children}</FeatureGate>
   - Create useFeature hook: const enabled = useFeature('quickFixes')
   - Features should be loaded at app init and cached

5. Static Feature-to-Tier Mapping (can be code constant, doesn't need DB):
```typescript
const TIER_FEATURES: Record<SubscriptionTier, FeatureKey[]> = {
  free: ['basicLinting', 'syntaxHighlighting'],
  pro: ['basicLinting', 'syntaxHighlighting', 'quickFixes', 'minimap', 'advancedAutocomplete'],
  enterprise: ['basicLinting', 'syntaxHighlighting', 'quickFixes', 'minimap', 'advancedAutocomplete', 'teamSnippets', 'auditLogs'],
};
```

6. Migration: Use `pnpm db:generate` and `pnpm db:migrate` workflow (NOT manual migration files)

### References
- AppExchange tier patterns: https://trailhead.salesforce.com/content/learn/modules/appexchange-pricing-strategy-for-partners/create-pricing-plan
- React feature flag patterns: https://blog.logrocket.com/how-to-implement-feature-flags-react/
- Permit.io tier-based approach: https://www.permit.io/blog/dynamic-react-feature-toggling-2024-guide

### Testing
- Unit tests for FeaturesService tier logic
- Unit tests for useFeature hook
- Integration test: free tier user cannot access pro feature

### Do Not
- Use external feature flag services (LaunchDarkly, Split, etc.)
- Add feature checks to existing code yet — just build the infrastructure
- Implement Quick Fixes — that's a separate task that will use this system
- Manually create migration files (use db:generate/db:migrate flow to preserve Drizzle journal)
