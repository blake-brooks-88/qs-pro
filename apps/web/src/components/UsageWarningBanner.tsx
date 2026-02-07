import { CloseCircle, InfoCircle } from "@solar-icons/react";

import { useUsageStore } from "@/store/usage-store";

interface UsageWarningBannerProps {
  resourceName: string;
  current: number;
  limit: number;
  resetDate: string;
}

export function UsageWarningBanner({
  resourceName,
  current,
  limit,
  resetDate,
}: UsageWarningBannerProps) {
  const isWarningBannerDismissed = useUsageStore(
    (s) => s.isWarningBannerDismissed,
  );

  if (isWarningBannerDismissed) {
    return null;
  }

  const formattedResetDate = new Date(resetDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-between gap-3 border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning shrink-0">
      <div className="flex items-center gap-2">
        <InfoCircle size={16} className="shrink-0" />
        <span>
          Running low on free {resourceName} &mdash; {current}/{limit} used this
          month.
          {resetDate ? (
            <span className="ml-1 text-warning/80">
              Resets {formattedResetDate}
            </span>
          ) : null}
        </span>
      </div>
      <button
        type="button"
        onClick={() => useUsageStore.getState().dismissWarningBanner()}
        className="text-warning/70 hover:text-warning transition-colors shrink-0"
        aria-label="Dismiss warning"
      >
        <CloseCircle size={16} />
      </button>
    </div>
  );
}
