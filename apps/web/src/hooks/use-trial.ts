import { useTenantFeatures } from "@/hooks/use-tenant-features";

export function useTrial() {
  const { data, isLoading } = useTenantFeatures();

  const trial = data?.trial ?? null;
  const isTrialActive = trial?.active ?? false;
  const daysRemaining = trial?.daysRemaining ?? null;
  const endsAt = trial?.endsAt ?? null;

  const showCountdown =
    isTrialActive && typeof daysRemaining === "number" && daysRemaining <= 5;

  const isTrialExpired =
    trial !== null && !trial.active && data?.tier === "free";

  return {
    isTrialActive,
    daysRemaining,
    showCountdown,
    isTrialExpired,
    endsAt,
    isLoading,
  };
}
