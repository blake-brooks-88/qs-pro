import api from "@/services/api";
import type { TenantFeatures } from "@qs-pro/shared-types";

export async function getTenantFeatures(): Promise<TenantFeatures> {
  const { data } = await api.get<TenantFeatures>("/features");
  return data;
}
