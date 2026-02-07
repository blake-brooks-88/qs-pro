import type {
  SubscriptionTier,
  TenantFeaturesResponse,
} from "@qpp/shared-types";

import api from "@/services/api";

export async function getTenantFeatures(): Promise<TenantFeaturesResponse> {
  const { data } = await api.get<TenantFeaturesResponse>("/features");
  return data;
}

export async function updateTier(
  tier: SubscriptionTier,
): Promise<TenantFeaturesResponse> {
  const { data } = await api.patch<TenantFeaturesResponse>("/features/tier", {
    tier,
  });
  return data;
}
