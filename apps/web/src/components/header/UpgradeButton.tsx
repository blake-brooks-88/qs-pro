import { Rocket } from "@solar-icons/react";

import { Button } from "@/components/ui/button";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

export function UpgradeButton() {
  const { data } = useTenantFeatures();
  const open = usePricingOverlayStore((s) => s.open);
  const tier = data?.tier ?? "free";

  if (tier !== "free") {
    return null;
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 text-xs font-semibold text-primary hover:text-primary"
      onClick={() => open("header")}
    >
      <Rocket size={14} />
      Upgrade
    </Button>
  );
}
