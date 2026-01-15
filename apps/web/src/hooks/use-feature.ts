import type { FeatureKey } from "@qs-pro/shared-types";
import { useTenantFeatures } from "@/hooks/use-tenant-features";

export function useFeature(featureKey: FeatureKey): boolean {
  const { data, isLoading } = useTenantFeatures();

  // Fail-closed: return false while loading or if data is unavailable
  if (isLoading || !data) {
    return false;
  }

  /**
   * ESLINT-DISABLE JUSTIFICATION:
   * This eslint-disable is an exception to project standards, not a pattern to follow.
   *
   * Why this is safe: `featureKey` is typed as `FeatureKey`, which is a Zod enum
   * defined in packages/shared-types/src/features.ts with compile-time constant values
   * ("basicLinting", "syntaxHighlighting", etc.). The `data` object is typed as
   * `TenantFeatures` (Record<FeatureKey, boolean>). TypeScript enforces that only
   * valid FeatureKey values can be passed to this hook. User input cannot reach this
   * code path because the hook parameter must satisfy the FeatureKey type at compile time.
   *
   * Why not refactor: Converting to Map would require transforming API response data
   * and would break the natural Record<FeatureKey, boolean> contract that aligns with
   * both the API response schema and TypeScript's type system. The typed record lookup
   * is idiomatic and cannot be exploited.
   */
  // eslint-disable-next-line security/detect-object-injection
  return data[featureKey] ?? false;
}
