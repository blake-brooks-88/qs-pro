import { ALL_FEATURE_KEYS } from "@qpp/shared-types";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  useFeatureOverrides,
  useRemoveFeatureOverride,
  useSetFeatureOverride,
} from "../hooks/use-tenant-detail";

interface FeatureOverridesCardProps {
  tenantId: string;
}

function FeatureOverridesCard({ tenantId }: FeatureOverridesCardProps) {
  const { data: overrides = [] } = useFeatureOverrides(tenantId);
  const setOverride = useSetFeatureOverride();
  const removeOverride = useRemoveFeatureOverride();

  const overrideMap = new Map(overrides.map((o) => [o.featureKey, o.enabled]));

  const handleToggle = (featureKey: string, currentlyOverridden: boolean) => {
    if (currentlyOverridden) {
      removeOverride.mutate(
        { tenantId, featureKey },
        {
          onSuccess: () => {
            toast.success(`Override removed: ${featureKey}`);
          },
          onError: () => {
            toast.error(`Failed to remove override: ${featureKey}`);
          },
        },
      );
    } else {
      setOverride.mutate(
        { tenantId, featureKey, enabled: true },
        {
          onSuccess: () => {
            toast.success(`Override enabled: ${featureKey}`);
          },
          onError: () => {
            toast.error(`Failed to set override: ${featureKey}`);
          },
        },
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feature Overrides</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {ALL_FEATURE_KEYS.map((key) => {
            const isOverridden = overrideMap.has(key);
            const isEnabled = overrideMap.get(key) ?? false;

            return (
              <div
                key={key}
                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-foreground">
                    {key}
                  </span>
                  {isOverridden ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      {isEnabled ? "ON" : "OFF"}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOverridden}
                  onClick={() => {
                    handleToggle(key, isOverridden);
                  }}
                  className={`
                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors
                    ${isOverridden ? "bg-primary" : "bg-muted"}
                  `}
                >
                  <span
                    className={`
                      pointer-events-none block h-3.5 w-3.5 rounded-full bg-background shadow-sm transition-transform
                      ${isOverridden ? "translate-x-4" : "translate-x-0.5"}
                    `}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export { FeatureOverridesCard };
