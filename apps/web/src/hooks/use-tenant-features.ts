import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { TenantFeatures } from "@qs-pro/shared-types";

export const featuresQueryKeys = {
  all: ["features"] as const,
  tenant: (tenantId?: string | null) =>
    [...featuresQueryKeys.all, "tenant", tenantId ?? "unknown"] as const,
};

const fetchTenantFeatures = async (): Promise<TenantFeatures> => {
  const response = await fetch("/api/features", { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to fetch tenant features");
  }
  return response.json() as Promise<TenantFeatures>;
};

export function useTenantFeatures(
  tenantId?: string | null,
): UseQueryResult<TenantFeatures, Error> {
  return useQuery({
    queryKey: featuresQueryKeys.tenant(tenantId),
    queryFn: fetchTenantFeatures,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}
