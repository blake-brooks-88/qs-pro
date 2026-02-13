import { LinkMinimalistic } from "@solar-icons/react";

import { cn } from "@/lib/utils";

interface LinkedBadgeProps {
  size?: "sm" | "md";
  qaName?: string | null;
  automationCount?: number | null;
  className?: string;
}

function formatCountSuffix(count: number): string {
  return `${count} automation${count !== 1 ? "s" : ""}`;
}

export function LinkedBadge({
  size = "sm",
  qaName,
  automationCount,
  className,
}: LinkedBadgeProps) {
  const iconSize = size === "sm" ? 12 : 16;

  if (size === "sm") {
    let title = qaName ? `Linked to ${qaName}` : "Linked to Query Activity";
    if (typeof automationCount === "number" && automationCount > 0) {
      title += ` \u00b7 ${formatCountSuffix(automationCount)}`;
    }

    return (
      <span
        className={cn("inline-flex items-center text-emerald-500", className)}
        title={title}
      >
        <LinkMinimalistic size={iconSize} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-emerald-500 text-xs font-medium max-w-48",
        className,
      )}
    >
      <LinkMinimalistic size={iconSize} />
      <span className="truncate">
        {qaName ? `Linked to ${qaName}` : "Linked"}
        {qaName &&
        typeof automationCount === "number" &&
        automationCount > 0 ? (
          <span className="text-muted-foreground font-normal">
            {" "}
            &middot; {formatCountSuffix(automationCount)}
          </span>
        ) : null}
      </span>
    </span>
  );
}
