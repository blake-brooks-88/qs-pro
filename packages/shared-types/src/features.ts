import { z } from "zod";

/**
 * Subscription tier levels for tenant pricing
 */
export const SubscriptionTierSchema = z.enum(["free", "pro", "enterprise"]);
export type SubscriptionTier = z.infer<typeof SubscriptionTierSchema>;

/**
 * Feature keys for all gated features in the application
 */
export const FeatureKeySchema = z.enum([
  "basicLinting",
  "syntaxHighlighting",
  "quickFixes",
  "minimap",
  "advancedAutocomplete",
  "querySharing",
  "teamSnippets",
  "auditLogs",
  "createDataExtension",
  "deployToAutomation",
  "systemDataViews",
  "runToTargetDE",
  "executionHistory",
  "versionHistory",
]);
export type FeatureKey = z.infer<typeof FeatureKeySchema>;

/**
 * All available feature keys as an array (for iteration)
 */
export const ALL_FEATURE_KEYS = FeatureKeySchema.options;

/**
 * Mapping of subscription tiers to their included features.
 * Higher tiers inherit all features from lower tiers.
 */
export const TIER_FEATURES: Record<SubscriptionTier, readonly FeatureKey[]> = {
  free: ["basicLinting", "syntaxHighlighting", "systemDataViews"],
  pro: [
    "basicLinting",
    "syntaxHighlighting",
    "quickFixes",
    "minimap",
    "advancedAutocomplete",
    "querySharing",
    "createDataExtension",
    "deployToAutomation",
    "systemDataViews",
    "runToTargetDE",
    "executionHistory",
    "versionHistory",
  ],
  enterprise: [
    "basicLinting",
    "syntaxHighlighting",
    "quickFixes",
    "minimap",
    "advancedAutocomplete",
    "querySharing",
    "createDataExtension",
    "teamSnippets",
    "auditLogs",
    "deployToAutomation",
    "systemDataViews",
    "runToTargetDE",
    "executionHistory",
    "versionHistory",
  ],
} as const;

/**
 * Response type for tenant features API
 * Maps each feature key to whether it's enabled for the tenant
 */
export const TenantFeaturesSchema = z.record(FeatureKeySchema, z.boolean());
export type TenantFeatures = z.infer<typeof TenantFeaturesSchema>;

/**
 * Helper to check if a feature is included in a tier (without overrides)
 */
export function isTierFeature(
  tier: SubscriptionTier,
  feature: FeatureKey,
): boolean {
  /**
   * ESLINT-DISABLE JUSTIFICATION:
   * This eslint-disable is an exception to project standards, not a pattern to follow.
   *
   * Why this is safe: The `tier` parameter is typed as `SubscriptionTier`, a Zod enum
   * with only three possible values ("free" | "pro" | "enterprise"). The `TIER_FEATURES`
   * object is typed as `Record<SubscriptionTier, ...>`, guaranteeing that all valid
   * tier values have corresponding keys. TypeScript enforces this at compile time.
   *
   * Why not refactor: Using a Map would require converting the existing Record constant
   * and all its type declarations, adding runtime overhead and reducing readability
   * for a pattern that is already provably safe via TypeScript's type system.
   */
  // eslint-disable-next-line security/detect-object-injection
  return TIER_FEATURES[tier].includes(feature);
}

/**
 * Helper to get all features for a tier as a TenantFeatures object
 */
export function getTierFeatures(tier: SubscriptionTier): TenantFeatures {
  const features: Partial<TenantFeatures> = {};
  for (const key of ALL_FEATURE_KEYS) {
    /**
     * ESLINT-DISABLE JUSTIFICATION:
     * This eslint-disable is an exception to project standards, not a pattern to follow.
     *
     * Why this is safe: Two typed lookups occur here:
     * 1. `features[key]` - `key` comes from `ALL_FEATURE_KEYS` (Zod enum options array),
     *    and `features` is typed as `Partial<TenantFeatures>` keyed by `FeatureKey`.
     * 2. `TIER_FEATURES[tier]` - `tier` is typed as `SubscriptionTier`, and `TIER_FEATURES`
     *    is a `Record<SubscriptionTier, ...>` with compile-time guaranteed keys.
     *
     * Why not refactor: Both lookups use TypeScript's enum/Record pattern which provides
     * compile-time safety. Switching to Map would require significant refactoring of the
     * type system and reduce the clarity of the feature configuration structure.
     */
    // eslint-disable-next-line security/detect-object-injection
    features[key] = TIER_FEATURES[tier].includes(key);
  }
  return features as TenantFeatures;
}

/**
 * Response type for tenant features API including tier
 */
export const TenantFeaturesResponseSchema = z.object({
  tier: SubscriptionTierSchema,
  features: TenantFeaturesSchema,
});
export type TenantFeaturesResponse = z.infer<
  typeof TenantFeaturesResponseSchema
>;
