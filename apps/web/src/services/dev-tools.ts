import type { TenantFeaturesResponse } from "@qpp/shared-types";

import api from "@/services/api";

export async function setTrialDays(
  days: number | null,
): Promise<TenantFeaturesResponse> {
  const { data } = await api.post<TenantFeaturesResponse>("/dev-tools/trial", {
    days,
  });
  return data;
}

export async function createCheckout(
  tier: "pro" | "enterprise",
  interval: "monthly" | "annual" = "monthly",
): Promise<{ url: string }> {
  const { data } = await api.post<{ url: string }>("/dev-tools/checkout", {
    tier,
    interval,
  });
  return data;
}

export interface SubscriptionStatePayload {
  tier: "free" | "pro" | "enterprise";
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  currentPeriodEnds?: string | null;
  trialEndsAt?: string | null;
  seatLimit?: number | null;
}

export async function setSubscriptionState(
  payload: SubscriptionStatePayload,
): Promise<TenantFeaturesResponse> {
  const { data } = await api.post<TenantFeaturesResponse>(
    "/dev-tools/subscription-state",
    payload,
  );
  return data;
}

export async function cancelSubscription(): Promise<{ canceled: boolean }> {
  const { data } = await api.post<{ canceled: boolean }>("/dev-tools/cancel");
  return data;
}

export async function resetToFree(): Promise<TenantFeaturesResponse> {
  const { data } = await api.post<TenantFeaturesResponse>("/dev-tools/reset");
  return data;
}
