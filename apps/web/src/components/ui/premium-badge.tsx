import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { cva, type VariantProps } from "class-variance-authority";
import { CrownStar } from "@solar-icons/react";
import { cn } from "@/lib/utils";

const premiumBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-full cursor-pointer transition-transform duration-200",
  {
    variants: {
      tier: {
        pro: "bg-pro-badge-bg text-pro-badge-foreground animate-badge-pulse-pro hover:scale-110 hover:animate-none hover:shadow-[0_4px_12px_rgba(255,159,28,0.5)]",
        enterprise:
          "bg-enterprise-badge-bg text-enterprise-badge-foreground animate-badge-pulse-enterprise hover:scale-110 hover:animate-none hover:shadow-[0_4px_12px_rgba(124,58,237,0.5)]",
      },
      size: {
        sm: "h-5 w-5",
        md: "h-6 w-6",
        lg: "h-7 px-2.5 gap-1",
      },
      position: {
        "top-right": "absolute -top-2 -right-2 z-[100]",
        "top-left": "absolute -top-2 -left-2 z-[100]",
        inline: "relative ml-2",
      },
    },
    defaultVariants: {
      tier: "pro",
      size: "md",
      position: "top-right",
    },
  },
);

const premiumBadgeIconVariants = cva("", {
  variants: {
    tier: {
      pro: "text-pro-badge-icon",
      enterprise: "text-enterprise-badge-icon",
    },
    size: {
      sm: "h-3 w-3",
      md: "h-3.5 w-3.5",
      lg: "h-4 w-4",
    },
  },
  defaultVariants: {
    tier: "pro",
    size: "md",
  },
});

export interface PremiumBadgeProps
  extends VariantProps<typeof premiumBadgeVariants> {
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
}

/** Visual badge only - no popover */
const PremiumBadgeIcon = React.forwardRef<
  HTMLSpanElement,
  Omit<PremiumBadgeProps, "title" | "description" | "ctaLabel" | "onCtaClick">
>(({ tier = "pro", size, position, className }, ref) => {
  const tierLabel = tier === "enterprise" ? "Enterprise" : "Pro";

  return (
    <span
      ref={ref}
      className={cn(premiumBadgeVariants({ tier, size, position }), className)}
      aria-label={`${tierLabel} feature`}
    >
      <CrownStar
        weight="BoldDuotone"
        className={premiumBadgeIconVariants({ tier, size })}
      />
      {size === "lg" && (
        <span className="text-[10px] font-bold uppercase tracking-wide">
          {tierLabel}
        </span>
      )}
    </span>
  );
});
PremiumBadgeIcon.displayName = "PremiumBadgeIcon";

/** Popover content for premium upsell */
interface PremiumPopoverContentProps {
  tier: "pro" | "enterprise";
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
}

const PremiumPopoverContent = React.forwardRef<
  React.ElementRef<typeof Popover.Content>,
  PremiumPopoverContentProps & React.ComponentPropsWithoutRef<typeof Popover.Content>
>(({ tier, title, description, ctaLabel = "Upgrade Now", onCtaClick, ...props }, ref) => {
  const tierLabel = tier === "enterprise" ? "Enterprise" : "Pro";
  const isPro = tier === "pro";

  // Semantic styles based on tier
  const styles = isPro
    ? {
        border: "border-pro-badge-bg/20",
        bgGradient: "from-pro-badge-bg/10 via-pro-badge-bg/5 to-transparent",
        iconContainer: "bg-pro-badge-bg/10 ring-pro-badge-bg/20",
        iconColor: "text-pro-badge-bg",
        badge: "bg-pro-badge-bg/10 text-pro-badge-bg border-pro-badge-bg/20",
        button: "bg-gradient-to-r from-pro-badge-bg to-pro-badge-accent text-pro-badge-foreground hover:shadow-lg hover:shadow-pro-badge-bg/25",
        shadow: "shadow-pro-badge-bg/5",
      }
    : {
        border: "border-enterprise-badge-bg/20",
        bgGradient: "from-enterprise-badge-bg/10 via-enterprise-badge-bg/5 to-transparent",
        iconContainer: "bg-enterprise-badge-bg/10 ring-enterprise-badge-bg/20",
        iconColor: "text-enterprise-badge-icon", // Use the gold icon color for extra premium feel
        badge: "bg-enterprise-badge-bg/10 text-enterprise-badge-accent border-enterprise-badge-bg/20",
        button: "bg-gradient-to-r from-enterprise-badge-bg to-enterprise-badge-accent text-enterprise-badge-foreground hover:shadow-lg hover:shadow-enterprise-badge-bg/25",
        shadow: "shadow-enterprise-badge-bg/5",
      };

  return (
    <Popover.Content
      ref={ref}
      className={cn(
        "z-[9999] w-80 rounded-2xl border bg-card/95 p-0 shadow-2xl backdrop-blur-xl",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        styles.border,
        styles.shadow
      )}
      sideOffset={16}
      align="end"
      collisionPadding={16}
      {...props}
    >
      {/* Glossy Top Highlight */}
      <div className={cn("absolute inset-x-0 top-0 h-32 bg-gradient-to-b opacity-100 pointer-events-none", styles.bgGradient)} />
      
      {/* Content Container */}
      <div className="relative p-6">
        <div className="flex items-start gap-4">
          {/* Icon Container */}
          <div className={cn(
            "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-inner ring-1",
            styles.iconContainer
          )}>
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent opacity-50" />
            <CrownStar
              weight="Fill"
              className={cn("h-6 w-6 drop-shadow-sm relative z-10", styles.iconColor)}
            />
          </div>

          <div className="flex-1 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 mb-2">
               <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border shadow-sm",
                styles.badge
              )}>
                {tierLabel}
              </span>
            </div>
            <h4 className="font-display text-lg font-bold tracking-tight text-foreground">
              {title}
            </h4>
          </div>
        </div>

        <div className="mt-4 mb-6">
          <p className="text-sm text-muted-foreground leading-relaxed font-medium">
            {description}
          </p>
        </div>

        {onCtaClick && (
          <button
            onClick={onCtaClick}
            className={cn(
              "group relative w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all duration-300",
              "hover:-translate-y-0.5 active:translate-y-0",
              styles.button
            )}
          >
            {/* Button Shine Overlay */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            
            <CrownStar weight="Bold" className="h-4 w-4 relative z-10" />
            <span className="relative z-10">{ctaLabel}</span>
          </button>
        )}
      </div>

      <Popover.Arrow
        className="fill-card"
        width={16}
        height={8}
      />
    </Popover.Content>
  );
});
PremiumPopoverContent.displayName = "PremiumPopoverContent";

/** Full badge with popover (standalone usage) */
const PremiumBadge = React.forwardRef<HTMLButtonElement, PremiumBadgeProps>(
  (
    {
      tier = "pro",
      size,
      position,
      title,
      description,
      ctaLabel = "Upgrade Now",
      onCtaClick,
      className,
    },
    ref,
  ) => {
    const tierLabel = tier === "enterprise" ? "Enterprise" : "Pro";

    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            ref={ref}
            className={cn(
              premiumBadgeVariants({ tier, size, position }),
              className,
            )}
            aria-label={`${tierLabel} feature`}
          >
            <CrownStar
              weight="BoldDuotone"
              className={premiumBadgeIconVariants({ tier, size })}
            />
            {size === "lg" && (
              <span className="text-[10px] font-bold uppercase tracking-wide">
                {tierLabel}
              </span>
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <PremiumPopoverContent
            tier={tier ?? "pro"}
            title={title}
            description={description}
            ctaLabel={ctaLabel}
            onCtaClick={onCtaClick}
          />
        </Popover.Portal>
      </Popover.Root>
    );
  },
);
PremiumBadge.displayName = "PremiumBadge";

export {
  PremiumBadge,
  PremiumBadgeIcon,
  PremiumPopoverContent,
  premiumBadgeVariants,
};
