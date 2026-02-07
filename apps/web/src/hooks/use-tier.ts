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
 * Constants for tier-based quota limits.
 * null = unlimited (Pro/Enterprise).
 */
export const QUOTA_LIMITS = {
  savedQueries: {
    free: 5,
    pro: null,
    enterprise: null,
  },
  queryRuns: {
    free: 50,
    pro: null,
    enterprise: null,
  },
} as const;

/** Percentage threshold (0.8 = 80%) at which soft warnings appear */
export const WARNING_THRESHOLD = 0.8;

/**
 * Hook to get the saved query limit for the current tier
 */
export function useSavedQueryLimit(): number | null {
  const { tier } = useTier();

  // eslint-disable-next-line security/detect-object-injection -- tier is typed as SubscriptionTier enum
  return QUOTA_LIMITS.savedQueries[tier];
}

/**
 * Hook to get the query run limit for the current tier
 */
export function useQueryRunLimit(): number | null {
  const { tier } = useTier();

  // eslint-disable-next-line security/detect-object-injection -- tier is typed as SubscriptionTier enum
  return QUOTA_LIMITS.queryRuns[tier];
}
