import type { SubscriptionTier } from "@qpp/shared-types";

import { useTenantFeatures } from "@/hooks/use-tenant-features";

/**
 * Hook to determine the current tenant's subscription tier.
 * Reads tier directly from the /features API response.
 * Returns "free" while loading (fail-closed approach).
 */
export function useTier(): {
  tier: SubscriptionTier;
  isLoading: boolean;
} {
  const { data, isLoading } = useTenantFeatures();

  return {
    tier: data?.tier ?? "free",
    isLoading,
  };
}

/**
 * Constants for tier-based quota limits
 */
export const QUOTA_LIMITS = {
  savedQueries: {
    free: 5,
    pro: null, // unlimited
    enterprise: null, // unlimited
  },
} as const;

/**
 * Hook to get the saved query limit for the current tier
 */
export function useSavedQueryLimit(): number | null {
  const { tier } = useTier();

  // eslint-disable-next-line security/detect-object-injection -- tier is typed as SubscriptionTier enum
  return QUOTA_LIMITS.savedQueries[tier];
}
