import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { usePermissions } from "@/hooks/use-permissions";

import {
  type TenantDetail,
  useCancelSubscription,
  useChangeTier,
} from "../hooks/use-tenant-detail";

interface SubscriptionCardProps {
  tenant: TenantDetail;
}

const TIER_VARIANT_MAP: Record<string, "secondary" | "default" | "outline"> = {
  free: "secondary",
  pro: "default",
  enterprise: "outline",
};

const STATUS_VARIANT_MAP: Record<
  string,
  "success" | "warning" | "destructive" | "secondary"
> = {
  active: "success",
  trialing: "warning",
  past_due: "destructive",
  canceled: "destructive",
  inactive: "secondary",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) {
    return "-";
  }
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SubscriptionCard({ tenant }: SubscriptionCardProps) {
  const { canAdmin, canEdit } = usePermissions();
  const navigate = useNavigate();
  const changeTier = useChangeTier();
  const cancelSub = useCancelSubscription();

  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<"pro" | "enterprise">("pro");
  const [selectedInterval, setSelectedInterval] = useState<
    "monthly" | "annual"
  >("monthly");

  const handleChangeTier = () => {
    changeTier.mutate(
      {
        tenantId: tenant.tenantId,
        tier: selectedTier,
        interval: selectedInterval,
      },
      {
        onSuccess: () => {
          toast.success("Tier changed successfully");
          setTierDialogOpen(false);
        },
        onError: () => {
          toast.error("Failed to change tier");
        },
      },
    );
  };

  const handleCancel = () => {
    cancelSub.mutate(
      { tenantId: tenant.tenantId },
      {
        onSuccess: () => {
          toast.success("Subscription canceled");
          setCancelDialogOpen(false);
        },
        onError: () => {
          toast.error("Failed to cancel subscription");
        },
      },
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">Tier</span>
              <div className="mt-0.5">
                <Badge variant={TIER_VARIANT_MAP[tenant.tier] ?? "secondary"}>
                  {capitalize(tenant.tier)}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <div className="mt-0.5">
                <Badge
                  variant={
                    STATUS_VARIANT_MAP[tenant.subscriptionStatus] ?? "secondary"
                  }
                >
                  {capitalize(tenant.subscriptionStatus.replace("_", " "))}
                </Badge>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Seat Limit</span>
              <p className="font-medium text-foreground">
                {tenant.seatLimit ?? "Unlimited"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Period Ends</span>
              <p className="font-medium text-foreground">
                {formatDate(tenant.currentPeriodEnds)}
              </p>
            </div>
            {tenant.trialEndsAt ? (
              <div>
                <span className="text-muted-foreground">Trial Ends</span>
                <p className="font-medium text-foreground">
                  {formatDate(tenant.trialEndsAt)}
                </p>
              </div>
            ) : null}
            {canAdmin && tenant.stripeSubscriptionId ? (
              <div className="col-span-2">
                <span className="text-muted-foreground">Stripe ID</span>
                <p>
                  <a
                    href={`https://dashboard.stripe.com/subscriptions/${tenant.stripeSubscriptionId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-primary hover:underline"
                    data-testid="stripe-link"
                  >
                    {tenant.stripeSubscriptionId}
                  </a>
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/30">
            {canAdmin ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setTierDialogOpen(true);
                  }}
                >
                  Change Tier
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    setCancelDialogOpen(true);
                  }}
                >
                  Cancel Subscription
                </Button>
              </>
            ) : null}
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigate(`/invoicing/create?eid=${tenant.eid}`);
                }}
              >
                Create Invoice
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Tier</DialogTitle>
            <DialogDescription>
              Update the subscription tier for {tenant.companyName}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground">New Tier</label>
              <Select
                value={selectedTier}
                onChange={(e) => {
                  setSelectedTier(e.target.value as "pro" | "enterprise");
                }}
                className="mt-1"
              >
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">
                Billing Interval
              </label>
              <Select
                value={selectedInterval}
                onChange={(e) => {
                  setSelectedInterval(e.target.value as "monthly" | "annual");
                }}
                className="mt-1"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTierDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleChangeTier} disabled={changeTier.isPending}>
              {changeTier.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              This will immediately cancel the subscription for{" "}
              {tenant.companyName}. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
              }}
            >
              Keep Subscription
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelSub.isPending}
            >
              {cancelSub.isPending ? "Canceling..." : "Cancel Subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { SubscriptionCard };
