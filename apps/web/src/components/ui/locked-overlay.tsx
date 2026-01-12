import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { cva, type VariantProps } from "class-variance-authority";
import {
  PremiumBadgeIcon,
  PremiumPopoverContent,
  type PremiumBadgeProps,
} from "./premium-badge";
import { cn } from "@/lib/utils";

const lockedOverlayVariants = cva("relative cursor-not-allowed", {
  variants: {
    variant: {
      button: "inline-block",
      panel: "block overflow-visible",
      menuItem: "inline-block",
    },
  },
  defaultVariants: {
    variant: "button",
  },
});

const lockedChildrenVariants = cva("", {
  variants: {
    variant: {
      button: "pointer-events-none opacity-50 grayscale",
      panel: "pointer-events-none opacity-40",
      menuItem: "pointer-events-none opacity-50",
    },
  },
  defaultVariants: {
    variant: "button",
  },
});

export interface LockedOverlayProps
  extends
    VariantProps<typeof lockedOverlayVariants>,
    Pick<
      PremiumBadgeProps,
      "tier" | "title" | "description" | "ctaLabel" | "onCtaClick"
    > {
  locked: boolean;
  children: React.ReactNode;
  badgeSize?: PremiumBadgeProps["size"];
  badgePosition?: PremiumBadgeProps["position"];
  className?: string;
}

const LockedOverlay = React.forwardRef<HTMLDivElement, LockedOverlayProps>(
  (
    {
      locked,
      variant = "button",
      tier = "pro",
      title,
      description,
      ctaLabel,
      onCtaClick,
      badgeSize = "md",
      badgePosition,
      children,
      className,
    },
    ref,
  ) => {
    const [isOpen, setIsOpen] = React.useState(false);

    if (!locked) {
      return <>{children}</>;
    }

    return (
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger asChild>
          <div
            ref={ref}
            className={cn(lockedOverlayVariants({ variant }), className)}
          >
            <PremiumBadgeIcon
              tier={tier}
              size={badgeSize}
              position={badgePosition ?? "top-right"}
            />
            <div className={lockedChildrenVariants({ variant })}>
              {children}
            </div>
            {variant === "panel" && (
              <div className="absolute inset-0 bg-background/30 backdrop-blur-[1px] pointer-events-none" />
            )}
          </div>
        </Popover.Trigger>
        <Popover.Portal forceMount>
          <PremiumPopoverContent
            tier={tier ?? "pro"}
            title={title ?? "Premium Feature"}
            description={description ?? "Upgrade to unlock this feature."}
            ctaLabel={ctaLabel}
            onCtaClick={onCtaClick}
            isOpen={isOpen}
          />
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
LockedOverlay.displayName = "LockedOverlay";

export { LockedOverlay, lockedOverlayVariants };
