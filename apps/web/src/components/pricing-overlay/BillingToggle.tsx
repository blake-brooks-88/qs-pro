import { cn } from "@/lib/utils";

import type { BillingInterval } from "./pricing-data";

interface BillingToggleProps {
  interval: BillingInterval;
  onChange: (interval: BillingInterval) => void;
  savingsPercent?: number;
}

export function BillingToggle({
  interval,
  onChange,
  savingsPercent = 17,
}: BillingToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-muted p-0.5">
      <button
        type="button"
        onClick={() => onChange("monthly")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
          interval === "monthly"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Monthly
      </button>
      <button
        type="button"
        onClick={() => onChange("annual")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-medium transition-all",
          interval === "annual"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Annual
        <span className="ml-1.5 text-xs font-semibold text-success">
          &minus;{savingsPercent}%
        </span>
      </button>
    </div>
  );
}
