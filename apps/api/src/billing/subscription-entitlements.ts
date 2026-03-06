import type { OrgSubscription } from '@qpp/database';
import type { SubscriptionTier } from '@qpp/shared-types';

export function hasPaidEntitlement(
  subscription: OrgSubscription | undefined,
  now: Date = new Date(),
): boolean {
  if (!subscription?.stripeSubscriptionId) {
    return false;
  }

  if (subscription.stripeSubscriptionStatus === 'trialing') {
    return true;
  }

  const hasPaidThrough =
    subscription.lastInvoicePaidAt !== null &&
    subscription.currentPeriodEnds !== null &&
    subscription.currentPeriodEnds > now;

  if (subscription.stripeSubscriptionStatus === 'active') {
    return hasPaidThrough;
  }

  if (subscription.stripeSubscriptionStatus === 'past_due') {
    return hasPaidThrough;
  }

  return false;
}

export function resolveEffectiveTier(
  subscription: OrgSubscription | undefined,
  now: Date = new Date(),
): SubscriptionTier {
  if (hasPaidEntitlement(subscription, now)) {
    return subscription?.tier ?? 'free';
  }

  if (subscription?.trialEndsAt && new Date(subscription.trialEndsAt) > now) {
    return subscription.tier;
  }

  return 'free';
}
