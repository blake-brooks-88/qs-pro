import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  useCancelSubscription,
  useCreateCheckout,
  useResetToFree,
  useSetSubscriptionState,
  useSetTrialDays,
} from "@/hooks/use-dev-tools";
import { useTenantFeatures } from "@/hooks/use-tenant-features";

function formatTrialStatus(
  trial: { active: boolean; daysRemaining: number | null } | null | undefined,
): string {
  if (!trial) {
    return "No trial";
  }
  if (!trial.active) {
    return "Expired";
  }
  if (trial.daysRemaining === null) {
    return "No trial";
  }
  return `${String(trial.daysRemaining)} days`;
}

export function DevSubscriptionPanel() {
  const { data } = useTenantFeatures();
  const setTrialDays = useSetTrialDays();
  const checkout = useCreateCheckout();
  const cancel = useCancelSubscription();
  const reset = useResetToFree();
  const subState = useSetSubscriptionState();

  const [trialDaysInput, setTrialDaysInput] = useState(14);
  const [checkoutInterval, setCheckoutInterval] = useState<
    "monthly" | "annual"
  >("monthly");
  const [stateTier, setStateTier] = useState<"free" | "pro" | "enterprise">(
    "pro",
  );

  const anyPending =
    setTrialDays.isPending ||
    checkout.isPending ||
    cancel.isPending ||
    reset.isPending ||
    subState.isPending;

  const hasStripe = data?.tier !== "free" && !data?.trial?.active;

  function handleSetTrial() {
    setTrialDays.mutate(trialDaysInput, {
      onSuccess: () =>
        toast.success(`Trial set to ${String(trialDaysInput)} days`),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Operation failed"),
    });
  }

  function handleClearTrial() {
    setTrialDays.mutate(null, {
      onSuccess: () => toast.success("Trial cleared"),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Operation failed"),
    });
  }

  function handleCheckout(tier: "pro" | "enterprise") {
    checkout.mutate(
      { tier, interval: checkoutInterval },
      {
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Operation failed"),
      },
    );
  }

  function handleSetSubscriptionState() {
    subState.mutate(
      { tier: stateTier },
      {
        onSuccess: () =>
          toast.success(`Subscription state set to ${stateTier}`),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Operation failed"),
      },
    );
  }

  function handleCancel() {
    cancel.mutate(undefined, {
      onSuccess: () => toast.success("Subscription canceled"),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Operation failed"),
    });
  }

  function handleReset() {
    reset.mutate(undefined, {
      onSuccess: () => toast.success("Reset to free tier"),
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Operation failed"),
    });
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="h-6 px-2 text-xs font-mono rounded border border-border bg-muted/50 text-muted-foreground hover:bg-muted">
          DEV
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 p-3 space-y-3 bg-popover border border-border rounded-lg shadow-lg"
        >
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Dev Subscription Panel
          </p>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Current State
            </p>
            <div className="space-y-0.5">
              <p className="text-xs font-mono">
                Tier: {data?.tier ?? "loading"}
              </p>
              <p className="text-xs font-mono">
                Trial: {formatTrialStatus(data?.trial)}
              </p>
              <p className="text-xs font-mono">
                Stripe: {hasStripe ? "Managed" : "Not connected"}
              </p>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Trial Controls
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={365}
                value={trialDaysInput}
                onChange={(e) => setTrialDaysInput(Number(e.target.value))}
                disabled={anyPending}
                className="h-7 w-20 px-2 text-xs rounded border border-border bg-background disabled:opacity-50"
              />
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={handleSetTrial}
              >
                Set Trial
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={handleClearTrial}
              >
                Clear Trial
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Stripe Controls
            </p>
            <div className="flex items-center gap-2 mb-1.5">
              <label
                htmlFor="checkout-interval"
                className="text-xs text-muted-foreground"
              >
                Interval:
              </label>
              <select
                id="checkout-interval"
                value={checkoutInterval}
                onChange={(e) =>
                  setCheckoutInterval(e.target.value as "monthly" | "annual")
                }
                disabled={anyPending}
                className="h-7 px-2 text-xs rounded border border-border bg-background disabled:opacity-50"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={() => handleCheckout("pro")}
              >
                Pro Checkout
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={() => handleCheckout("enterprise")}
              >
                Enterprise Checkout
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Subscription State
            </p>
            <div className="flex items-center gap-2">
              <select
                value={stateTier}
                onChange={(e) =>
                  setStateTier(e.target.value as "free" | "pro" | "enterprise")
                }
                disabled={anyPending}
                className="h-7 px-2 text-xs rounded border border-border bg-background disabled:opacity-50"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={handleSetSubscriptionState}
              >
                Set State
              </Button>
            </div>
          </div>

          <div className="border-t border-border" />

          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Danger Zone
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={handleCancel}
              >
                Cancel Subscription
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                disabled={anyPending}
                onClick={handleReset}
              >
                Reset to Free
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
