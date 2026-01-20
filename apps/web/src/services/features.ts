import type { TenantFeatures } from "@qpp/shared-types";

import api from "@/services/api";

export async function getTenantFeatures(): Promise<TenantFeatures> {
  const { data } = await api.get<TenantFeatures>("/features");
  return data;
}
