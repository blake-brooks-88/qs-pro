import type { OrgSubscription } from '@qpp/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasPaidEntitlement,
  resolveEffectiveTier,
} from '../subscription-entitlements';

function createSubscription(
  overrides: Partial<OrgSubscription> = {},
): OrgSubscription {
  return {
    id: 'sub-1',
    tenantId: 'tenant-1',
    tier: 'pro',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_1',
    stripeSubscriptionStatus: 'active',
    seatLimit: null,
    trialEndsAt: null,
    currentPeriodEnds: new Date('2026-04-01T00:00:00.000Z'),
    lastInvoicePaidAt: new Date('2026-03-01T00:00:00.000Z'),
    stripeStateUpdatedAt: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('subscription entitlements', () => {
  const now = new Date('2026-03-15T00:00:00.000Z');

  beforeEach(() => {
    vi.useRealTimers();
  });

  it('grants paid entitlement for active paid-through subscriptions', () => {
    expect(hasPaidEntitlement(createSubscription(), now)).toBe(true);
  });

  it('grants paid entitlement for trialing subscriptions with a Stripe subscription id', () => {
    expect(
      hasPaidEntitlement(
        createSubscription({
          stripeSubscriptionStatus: 'trialing',
          currentPeriodEnds: null,
          lastInvoicePaidAt: null,
        }),
        now,
      ),
    ).toBe(true);
  });

  it('denies paid entitlement when the paid-through window has expired', () => {
    expect(
      hasPaidEntitlement(
        createSubscription({
          currentPeriodEnds: new Date('2026-03-10T00:00:00.000Z'),
        }),
        now,
      ),
    ).toBe(false);
  });

  it('denies paid entitlement when the Stripe subscription id is missing', () => {
    expect(
      hasPaidEntitlement(
        createSubscription({
          stripeSubscriptionId: null,
        }),
        now,
      ),
    ).toBe(false);
  });

  it('resolves to the paid tier when paid entitlement exists', () => {
    expect(resolveEffectiveTier(createSubscription(), now)).toBe('pro');
  });

  it('falls back to the trial tier when the trial is still active', () => {
    expect(
      resolveEffectiveTier(
        createSubscription({
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          stripeSubscriptionStatus: 'inactive',
          currentPeriodEnds: null,
          lastInvoicePaidAt: null,
          trialEndsAt: new Date('2026-03-20T00:00:00.000Z'),
        }),
        now,
      ),
    ).toBe('pro');
  });

  it('falls back to free when neither paid nor trial entitlement exists', () => {
    expect(
      resolveEffectiveTier(
        createSubscription({
          tier: 'free',
          stripeSubscriptionId: null,
          stripeCustomerId: null,
          stripeSubscriptionStatus: 'inactive',
          currentPeriodEnds: null,
          lastInvoicePaidAt: null,
          trialEndsAt: new Date('2026-03-10T00:00:00.000Z'),
        }),
        now,
      ),
    ).toBe('free');
  });
});
