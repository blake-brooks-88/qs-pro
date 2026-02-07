import { LockKeyhole, Rocket } from "@solar-icons/react";
import { type ReactNode, useState } from "react";

import { UpgradeModal } from "@/components/UpgradeModal";
import { cn } from "@/lib/utils";

interface QuotaGateProps {
  /** Current usage count */
  current: number;
  /** Maximum allowed (null = unlimited/Pro) */
  limit: number | null;
  /** What resource is being limited */
  resourceName: string;
  /** Content to render when under quota */
  children: ReactNode;
  /** Content to render when at quota */
  blockedContent?: ReactNode;
  /** Whether to show count in compact mode */
  showCount?: boolean;
  /** Additional className */
  className?: string;
}

export function QuotaGate({
  current,
  limit,
  resourceName,
  children,
  blockedContent,
  showCount = true,
  className,
}: QuotaGateProps) {
  // Pro users (limit = null) always pass
  if (limit === null) {
    return <>{children}</>;
  }

  const isAtQuota = current >= limit;
  const isNearQuota = current >= limit - 1;

  if (isAtQuota) {
    return (
      blockedContent ?? (
        <QuotaBlockedDefault resourceName={resourceName} limit={limit} />
      )
    );
  }

  return (
    <div className={className}>
      {showCount ? (
        <div
          className={cn(
            "text-xs mb-2",
            isNearQuota ? "text-warning" : "text-muted-foreground",
          )}
        >
          {resourceName} ({current}/{limit})
          {isNearQuota ? (
            <span className="ml-1 text-warning">- Almost at limit</span>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

interface QuotaBlockedDefaultProps {
  resourceName: string;
  limit: number;
}

function QuotaBlockedDefault({
  resourceName,
  limit,
}: QuotaBlockedDefaultProps) {
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false);

  return (
    <div className="p-4 border border-border rounded-lg bg-card text-center">
      <LockKeyhole size={32} className="mx-auto mb-2 text-muted-foreground" />
      <h3 className="font-semibold text-foreground mb-1">
        {resourceName} Limit Reached
      </h3>
      <p className="text-sm text-muted-foreground mb-3">
        You&apos;ve reached the free tier limit of {limit}{" "}
        {resourceName.toLowerCase()}.
      </p>
      <button
        type="button"
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        onClick={() => setIsUpgradeOpen(true)}
      >
        <Rocket size={16} />
        Upgrade to Pro
      </button>
      <UpgradeModal
        isOpen={isUpgradeOpen}
        onClose={() => setIsUpgradeOpen(false)}
      />
    </div>
  );
}

interface QuotaCountBadgeProps {
  current: number;
  limit: number | null;
  resourceName: string;
  className?: string;
}

export function QuotaCountBadge({
  current,
  limit,
  resourceName,
  className,
}: QuotaCountBadgeProps) {
  // Don't show for Pro users
  if (limit === null) {
    return null;
  }

  const isNearQuota = current >= limit - 1;
  const isAtQuota = current >= limit;

  return (
    <span
      className={cn(
        "text-xs px-1.5 py-0.5 rounded",
        isAtQuota
          ? "bg-destructive/10 text-destructive"
          : isNearQuota
            ? "bg-warning/10 text-warning"
            : "bg-muted text-muted-foreground",
        className,
      )}
      title={`${resourceName}: ${current} of ${limit} used`}
    >
      {current}/{limit}
    </span>
  );
}
