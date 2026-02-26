import type { SubscriptionTier } from "@qpp/shared-types";
import {
  CheckCircle,
  ClockCircle,
  CloseSquare,
  LetterOpened,
  ShieldCheck,
} from "@solar-icons/react";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

import { useCheckout } from "@/hooks/use-checkout";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { track } from "@/lib/analytics";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

import { BillingToggle } from "./BillingToggle";
import { FaqAccordion } from "./FaqAccordion";
import { FeatureComparisonTable } from "./FeatureComparisonTable";
import type { BillingInterval } from "./pricing-data";
import { TIERS } from "./pricing-data";
import { TierCard } from "./TierCard";

const ENTERPRISE_CONTACT_MAILTO = "mailto:sales@queryplusplus.com";

export function PricingOverlay() {
  const { isOpen, source, close } = usePricingOverlayStore();
  const [interval, setInterval] = useState<BillingInterval>("annual");
  const { data: featuresData } = useTenantFeatures();
  const checkout = useCheckout();

  const currentTier: SubscriptionTier = featuresData?.tier ?? "free";

  const handleIntervalChange = useCallback(
    (next: BillingInterval) => {
      setInterval(next);
      track("billing_interval_toggled", { interval: next, source });
    },
    [source],
  );

  const handleTierSelect = useCallback(
    (tierId: SubscriptionTier) => {
      if (tierId === "enterprise") {
        track("enterprise_contact_clicked", { source });
        window.open(ENTERPRISE_CONTACT_MAILTO, "_blank");
        return;
      }
      if (tierId === "pro") {
        track("checkout_initiated", { interval, source });
        checkout.mutate({ tier: "pro", interval });
      }
    },
    [interval, source, checkout],
  );

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key="pricing-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm"
        >
          {/* Header bar */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Choose your plan
            </h2>
            <button
              type="button"
              onClick={close}
              className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close pricing overlay"
            >
              <CloseSquare size={20} weight="Bold" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl px-6 py-10">
              {/* Billing toggle */}
              <div className="mb-8 flex justify-center">
                <BillingToggle
                  interval={interval}
                  onChange={handleIntervalChange}
                />
              </div>

              {/* Tier cards */}
              <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-3">
                {TIERS.map((tier) => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    interval={interval}
                    currentTier={currentTier}
                    onSelect={handleTierSelect}
                    isCheckoutPending={checkout.isPending}
                  />
                ))}
              </div>

              {/* Trust signals */}
              <div className="mb-12 flex items-center justify-center gap-8 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <CheckCircle size={14} />
                  Cancel anytime
                </span>
                <span className="flex items-center gap-1.5">
                  <ShieldCheck size={14} />
                  Secure checkout by Stripe
                </span>
                <span className="flex items-center gap-1.5">
                  <ClockCircle size={14} />
                  14-day free trial
                </span>
              </div>

              {/* Social proof */}
              <p className="mb-12 text-center text-xs text-muted-foreground">
                Built for Marketing Cloud teams
              </p>

              {/* Feature comparison */}
              <section className="mb-16">
                <h3 className="mb-6 text-center font-display text-xl font-bold text-foreground">
                  Compare Plans
                </h3>
                <FeatureComparisonTable />
              </section>

              {/* FAQ */}
              <section className="mb-16">
                <h3 className="mb-6 text-center font-display text-xl font-bold text-foreground">
                  Frequently Asked Questions
                </h3>
                <div className="mx-auto max-w-2xl">
                  <FaqAccordion />
                </div>
              </section>

              {/* Enterprise CTA */}
              <section className="mb-8 text-center">
                <div className="mx-auto max-w-md rounded-xl border border-enterprise-badge-bg/20 bg-enterprise-badge-bg/5 p-6">
                  <LetterOpened
                    size={28}
                    weight="Bold"
                    className="mx-auto mb-3 text-enterprise-badge-bg"
                  />
                  <h4 className="font-display text-base font-bold text-foreground">
                    Need Enterprise?
                  </h4>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Get team collaboration, audit logs, and priority support.
                  </p>
                  <a
                    href={ENTERPRISE_CONTACT_MAILTO}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-enterprise-badge-bg px-4 py-2 text-sm font-medium text-enterprise-badge-foreground transition-colors hover:bg-enterprise-badge-bg/90"
                  >
                    Contact Sales
                  </a>
                </div>
              </section>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
