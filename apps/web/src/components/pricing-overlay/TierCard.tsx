import type { SubscriptionTier } from "@qpp/shared-types";
import { CheckCircle, CrownStar } from "@solar-icons/react";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getTierCta } from "./get-tier-cta";
import type { BillingInterval, TierDefinition } from "./pricing-data";

interface TierCardProps {
  tier: TierDefinition;
  interval: BillingInterval;
  currentTier: SubscriptionTier;
  isTrialActive: boolean;
  onSelect: (tierId: SubscriptionTier) => void;
  isCheckoutPending: boolean;
}

function getCheckColor(isPro: boolean, isEnterprise: boolean): string {
  if (isPro) {
    return "text-pro-badge-bg";
  }
  if (isEnterprise) {
    return "text-enterprise-badge-bg";
  }
  return "text-muted-foreground";
}

export function TierCard({
  tier,
  interval,
  currentTier,
  isTrialActive,
  onSelect,
  isCheckoutPending,
}: TierCardProps) {
  const cta = getTierCta(tier.id, currentTier, isTrialActive, tier.cta);
  const isPro = tier.id === "pro";
  const price = interval === "annual" ? tier.annualPrice : tier.monthlyPrice;
  const isEnterprise = tier.id === "enterprise";
  const annualTotal =
    tier.annualPrice !== null ? String(tier.annualPrice * 12) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative flex flex-col rounded-xl border p-6",
        tier.highlight
          ? "border-pro-badge-bg/40 bg-card shadow-lg shadow-pro-shadow dark:border-pro-badge-bg/30"
          : "border-border bg-card",
      )}
    >
      {tier.highlight ? (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1 rounded-full bg-pro-badge-bg px-3 py-0.5 text-xs font-bold text-pro-badge-foreground">
            <CrownStar weight="Bold" className="h-3 w-3" />
            Most Popular
          </span>
        </div>
      ) : null}

      <div className="mb-4">
        <h3 className="font-display text-lg font-bold text-foreground">
          {tier.name}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{tier.tagline}</p>
      </div>

      <div className="mb-6">
        {price !== null ? (
          <div className="flex items-baseline gap-1">
            <span className="font-display text-4xl font-bold tracking-tight text-foreground">
              ${String(price)}
            </span>
            <span className="text-sm text-muted-foreground">/ mo</span>
          </div>
        ) : (
          <div className="flex items-baseline">
            <span className="font-display text-2xl font-bold tracking-tight text-foreground">
              Custom
            </span>
          </div>
        )}
        {isPro && interval === "annual" && annualTotal !== null ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Billed annually (${annualTotal} / yr)
          </p>
        ) : null}
      </div>

      <ul className="mb-6 flex-1 space-y-2.5">
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm">
            <CheckCircle
              size={16}
              weight="Bold"
              className={cn(
                "mt-0.5 shrink-0",
                getCheckColor(isPro, isEnterprise),
              )}
            />
            <span className="text-foreground">{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        className={cn(
          "w-full",
          isPro
            ? "bg-pro-badge-bg text-pro-badge-foreground hover:bg-pro-badge-bg/90"
            : undefined,
          isEnterprise
            ? "bg-enterprise-badge-bg text-enterprise-badge-foreground hover:bg-enterprise-badge-bg/90"
            : undefined,
        )}
        variant={cta.disabled ? "outline" : "default"}
        disabled={cta.disabled || (isPro && isCheckoutPending)}
        onClick={() => onSelect(tier.id)}
      >
        {cta.text}
      </Button>
    </motion.div>
  );
}
