import type { SubscriptionTier } from "@qpp/shared-types";

import { useTier } from "@/hooks/use-tier";
import { useUpdateTier } from "@/hooks/use-update-tier";

const TIERS: Array<{ value: SubscriptionTier; label: string }> = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "enterprise", label: "Enterprise" },
];

export function DevTierSelector() {
  const { tier } = useTier();
  const { mutate, isPending } = useUpdateTier();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    mutate(e.target.value as SubscriptionTier);
  }

  return (
    <select
      value={tier}
      onChange={handleChange}
      disabled={isPending}
      className="ml-2 h-6 px-2 text-xs rounded border border-border bg-muted/50 text-muted-foreground cursor-pointer hover:bg-muted focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
    >
      {TIERS.map(({ value, label }) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}
