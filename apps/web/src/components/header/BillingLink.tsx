import { Rocket, Settings } from "@solar-icons/react";

import { Button } from "@/components/ui/button";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { useTrial } from "@/hooks/use-trial";
import { track } from "@/lib/analytics";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

export function BillingLink() {
  const { data } = useTenantFeatures();
  const portalSession = usePortalSession();
  const { isTrialActive } = useTrial();
  const openPricing = usePricingOverlayStore((s) => s.open);
  const tier = data?.tier ?? "free";

  if (tier === "free") {
    return null;
  }

  if (isTrialActive) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          track("pricing_overlay_opened", { source: "header" });
          openPricing("header");
        }}
      >
        <Rocket size={14} />
        Subscribe
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => {
        track("portal_opened", { source: "header" });
        portalSession.mutate();
      }}
      disabled={portalSession.isPending}
    >
      <Settings size={14} />
      Billing
    </Button>
  );
}
