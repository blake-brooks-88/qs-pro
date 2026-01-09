import type { FeatureKey } from "@qs-pro/shared-types";
import { useTenantFeatures } from "@/hooks/use-tenant-features";

export function useFeature(featureKey: FeatureKey): boolean {
  const { data, isLoading } = useTenantFeatures();

  // Fail-closed: return false while loading or if data is unavailable
  if (isLoading || !data) {
    return false;
  }

  return data[featureKey] ?? false;
}
