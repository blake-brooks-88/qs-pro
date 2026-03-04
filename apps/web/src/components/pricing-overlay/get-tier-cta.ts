import type { SubscriptionTier } from "@qpp/shared-types";

export interface TierCta {
  text: string;
  disabled: boolean;
}

export function getTierCta(
  tierId: SubscriptionTier,
  currentTier: SubscriptionTier,
  isTrialActive: boolean,
  defaultCta: string,
): TierCta {
  const isPro = tierId === "pro";
  const isCurrent = currentTier === tierId && !(isTrialActive && isPro);

  if (isCurrent) {
    return { text: "Current Plan", disabled: true };
  }

  if (isTrialActive && isPro) {
    return { text: "Subscribe to Pro", disabled: false };
  }

  return { text: defaultCta, disabled: false };
}
