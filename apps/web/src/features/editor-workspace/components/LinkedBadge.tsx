import { LinkMinimalistic } from "@solar-icons/react";

import { cn } from "@/lib/utils";

interface LinkedBadgeProps {
  size?: "sm" | "md";
  qaName?: string | null;
  className?: string;
}

export function LinkedBadge({
  size = "sm",
  qaName,
  className,
}: LinkedBadgeProps) {
  const iconSize = size === "sm" ? 12 : 16;

  if (size === "sm") {
    return (
      <span
        className={cn("inline-flex items-center text-emerald-500", className)}
        title={qaName ? `Linked to ${qaName}` : "Linked to Query Activity"}
      >
        <LinkMinimalistic size={iconSize} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-emerald-500 text-xs font-medium",
        className,
      )}
    >
      <LinkMinimalistic size={iconSize} />
      <span className="truncate">
        {qaName ? `Linked to ${qaName}` : "Linked"}
      </span>
    </span>
  );
}
