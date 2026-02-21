import { CloseCircle, InfoCircle } from "@solar-icons/react";

import { Button } from "@/components/ui/button";

interface TrialExpiredBannerProps {
  pricingUrl: string;
  onDismiss: () => void;
}

export function TrialExpiredBanner({
  pricingUrl,
  onDismiss,
}: TrialExpiredBannerProps) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2 text-sm text-foreground shrink-0">
      <div className="flex items-center gap-2">
        <InfoCircle size={16} className="shrink-0 text-muted-foreground" />
        <span>
          Your Pro trial has ended.{" "}
          <span className="text-muted-foreground">
            Upgrade to restore all features.
          </span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs font-medium text-primary hover:text-primary"
          onClick={() =>
            window.open(pricingUrl, "_blank", "noopener,noreferrer")
          }
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
