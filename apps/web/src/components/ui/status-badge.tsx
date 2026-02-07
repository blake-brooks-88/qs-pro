import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border",
  {
    variants: {
      variant: {
        success: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        failed: "bg-destructive/10 text-destructive border-destructive/20",
        canceled: "bg-muted text-muted-foreground border-border",
        running: "bg-blue-500/10 text-blue-500 border-blue-500/20",
        queued: "bg-amber-500/10 text-amber-500 border-amber-500/20",
        default: "bg-muted text-muted-foreground border-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const statusDotVariants = cva("h-1.5 w-1.5 rounded-full shrink-0", {
  variants: {
    variant: {
      success: "bg-emerald-500",
      failed: "bg-destructive",
      canceled: "bg-muted-foreground",
      running: "bg-blue-500 animate-pulse",
      queued: "bg-amber-500",
      default: "bg-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface StatusBadgeProps extends VariantProps<
  typeof statusBadgeVariants
> {
  variant: "success" | "failed" | "canceled" | "running" | "queued" | "default";
  children?: React.ReactNode;
  className?: string;
}

const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ variant = "default", children, className }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          statusBadgeVariants({ variant }),
          variant === "running" && "animate-pulse",
          className,
        )}
      >
        <span className={statusDotVariants({ variant })} aria-hidden="true" />
        {children}
      </span>
    );
  },
);
StatusBadge.displayName = "StatusBadge";

export function runStatusToVariant(
  status: string,
): StatusBadgeProps["variant"] {
  switch (status) {
    case "ready":
      return "success";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "running":
      return "running";
    case "queued":
      return "queued";
    default:
      return "default";
  }
}

export { StatusBadge, statusBadgeVariants };
