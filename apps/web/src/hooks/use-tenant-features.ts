import type { TenantFeaturesResponse } from "@qpp/shared-types";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getTenantFeatures } from "@/services/features";

export const featuresQueryKeys = {
  all: ["features"] as const,
  tenant: (tenantId?: string | null) =>
    [...featuresQueryKeys.all, "tenant", tenantId ?? "unknown"] as const,
};

export function useTenantFeatures(
  tenantId?: string | null,
): UseQueryResult<TenantFeaturesResponse, Error> {
  return useQuery({
    queryKey: featuresQueryKeys.tenant(tenantId),
    queryFn: getTenantFeatures,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}
