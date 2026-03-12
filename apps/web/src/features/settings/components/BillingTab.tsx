import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { useTrial } from "@/hooks/use-trial";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

function tierLabel(tier: string): string {
  switch (tier) {
    case "pro":
      return "Pro";
    case "enterprise":
      return "Enterprise";
    default:
      return "Free";
  }
}

export function BillingTab() {
  const { data } = useTenantFeatures();
  const { isTrialActive, daysRemaining, isTrialExpired } = useTrial();
  const portalSession = usePortalSession();
  const openPricing = usePricingOverlayStore((s) => s.open);

  const tier = data?.tier ?? "free";
  const currentPeriodEnds = data?.currentPeriodEnds;
  const hasPaidTier = tier !== "free";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {tierLabel(tier)}
              </span>
            </div>

            {isTrialActive && daysRemaining !== null ? (
              <p className="text-xs text-muted-foreground">
                Trial ends in {String(daysRemaining)} day
                {daysRemaining === 1 ? "" : "s"}
              </p>
            ) : null}

            {isTrialExpired ? (
              <p className="text-xs text-destructive">Trial expired</p>
            ) : null}

            {hasPaidTier && currentPeriodEnds ? (
              <p className="text-xs text-muted-foreground">
                Current period ends{" "}
                {new Date(currentPeriodEnds).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            {hasPaidTier ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => portalSession.mutate()}
                disabled={portalSession.isPending}
              >
                Manage Billing
              </Button>
            ) : null}

            {tier !== "enterprise" && (
              <Button
                variant="default"
                size="sm"
                onClick={() => openPricing("settings_billing")}
              >
                {tier === "free" ? "Upgrade Plan" : "Upgrade to Enterprise"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
