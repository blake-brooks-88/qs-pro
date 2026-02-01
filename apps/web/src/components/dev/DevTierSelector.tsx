import type { SubscriptionTier } from "@qpp/shared-types";

const DEV_TIER_KEY = "dev-tier-override";

function getCurrentTier(): string {
  return localStorage.getItem(DEV_TIER_KEY) ?? "";
}

function handleTierChange(e: React.ChangeEvent<HTMLSelectElement>): void {
  const tier = e.target.value;
  if (tier) {
    localStorage.setItem(DEV_TIER_KEY, tier);
  } else {
    localStorage.removeItem(DEV_TIER_KEY);
  }
  window.location.reload();
}

const TIERS: Array<{ value: string; label: string }> = [
  { value: "", label: "API" },
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export function DevTierSelector() {
  const currentTier = getCurrentTier();

  return (
    <select
      value={currentTier}
      onChange={handleTierChange}
      className="ml-2 h-6 px-2 text-xs rounded border border-border bg-muted/50 text-muted-foreground cursor-pointer hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {TIERS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

export function getDevTierOverride(): SubscriptionTier | null {
  const tier = localStorage.getItem(DEV_TIER_KEY);
  if (tier === "free" || tier === "pro" || tier === "enterprise") {
    return tier;
  }
  return null;
}
