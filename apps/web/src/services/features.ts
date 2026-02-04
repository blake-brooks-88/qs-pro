import type { TenantFeaturesResponse } from "@qpp/shared-types";

import api from "@/services/api";

export async function getTenantFeatures(): Promise<TenantFeaturesResponse> {
  const { data } = await api.get<TenantFeaturesResponse>("/features");
  return data;
}
