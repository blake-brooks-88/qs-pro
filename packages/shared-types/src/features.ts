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
  "teamSnippets",
  "auditLogs",
  "createDataExtension",
  "deployToAutomation",
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
  free: ["basicLinting", "syntaxHighlighting"],
  pro: [
    "basicLinting",
    "syntaxHighlighting",
    "quickFixes",
    "minimap",
    "advancedAutocomplete",
    "createDataExtension",
  ],
  enterprise: [
    "basicLinting",
    "syntaxHighlighting",
    "quickFixes",
    "minimap",
    "advancedAutocomplete",
    "createDataExtension",
    "teamSnippets",
    "auditLogs",
    "deployToAutomation",
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
  return TIER_FEATURES[tier].includes(feature);
}

/**
 * Helper to get all features for a tier as a TenantFeatures object
 */
export function getTierFeatures(tier: SubscriptionTier): TenantFeatures {
  const features: Partial<TenantFeatures> = {};
  for (const key of ALL_FEATURE_KEYS) {
    features[key] = TIER_FEATURES[tier].includes(key);
  }
  return features as TenantFeatures;
}
