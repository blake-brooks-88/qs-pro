import { Settings } from "@solar-icons/react";

import { Button } from "@/components/ui/button";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { track } from "@/lib/analytics";

export function BillingLink() {
  const { data } = useTenantFeatures();
  const portalSession = usePortalSession();
  const tier = data?.tier ?? "free";

  if (tier === "free") {
    return null;
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
