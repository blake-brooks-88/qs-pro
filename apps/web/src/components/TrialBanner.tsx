import { CloseCircle, InfoCircle } from "@solar-icons/react";

import { Button } from "@/components/ui/button";

interface TrialBannerProps {
  daysRemaining: number;
  onViewPlans: () => void;
  onDismiss: () => void;
}

function getCountdownText(daysRemaining: number): string {
  if (daysRemaining === 0) {
    return "Your Pro trial ends today.";
  }
  if (daysRemaining === 1) {
    return "Your Pro trial ends tomorrow.";
  }
  return `Your Pro trial ends in ${String(daysRemaining)} days.`;
}

export function TrialBanner({
  daysRemaining,
  onViewPlans,
  onDismiss,
}: TrialBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-primary/10 px-4 py-2 text-sm text-foreground shrink-0">
      <div className="flex items-center gap-2">
        <InfoCircle size={16} className="shrink-0 text-primary" />
        <span>
          {getCountdownText(daysRemaining)}{" "}
          <span className="text-muted-foreground">
            Upgrade to keep all features.
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs font-medium text-primary hover:text-primary"
          onClick={onViewPlans}
        >
          View Plans
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-muted-foreground/70 hover:text-muted-foreground transition-colors shrink-0"
          aria-label="Dismiss banner"
        >
          <CloseCircle size={16} />
        </button>
      </div>
    </div>
  );
}
