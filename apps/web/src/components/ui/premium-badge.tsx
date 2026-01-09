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

  // Re-imagined Design System
  const theme = isPro
    ? {
        // Pro: Energetic Orange & Pink
        wrapper: "border-pro-badge-bg/20 shadow-[0_8px_32px_-8px_var(--color-pro-shadow)]",
        spotlight: "bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-pro-badge-bg/10 via-transparent to-transparent",
        iconWrapper: "bg-gradient-to-br from-pro-badge-bg to-pro-badge-accent text-white shadow-lg shadow-pro-badge-bg/20",
        title: "text-foreground",
        tierText: "text-pro-badge-bg",
        button: "bg-gradient-to-r from-pro-badge-bg to-pro-badge-accent hover:shadow-lg hover:shadow-pro-badge-bg/25 text-white",
      }
    : {
        // Enterprise: Regal Purple & Gold (High Contrast)
        wrapper: "border-enterprise-badge-accent/30 shadow-[0_8px_32px_-8px_var(--color-enterprise-shadow)]",
        // Using accent (lighter purple) for the spotlight to avoid "dark/muted" feel
        spotlight: "bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-enterprise-badge-accent/15 via-transparent to-transparent",
        // Purple bg with Gold icon for contrast
        iconWrapper: "bg-gradient-to-br from-enterprise-badge-bg to-enterprise-badge-accent text-enterprise-badge-icon shadow-lg shadow-enterprise-badge-bg/30",
        title: "text-foreground",
        tierText: "text-enterprise-badge-accent", // Lighter purple for text
        button: "bg-gradient-to-r from-enterprise-badge-bg to-enterprise-badge-accent hover:shadow-lg hover:shadow-enterprise-badge-bg/25 text-white",
      };

  return (
    <Popover.Content
      ref={ref}
      className={cn(
        "z-[9999] w-[340px] overflow-hidden rounded-2xl border bg-card/95 p-0 backdrop-blur-xl transition-all outline-none",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
        theme.wrapper
      )}
      sideOffset={16}
      align="end"
      collisionPadding={16}
      {...props}
    >
      {/* Ambient Spotlight */}
      <div className={cn("absolute inset-0 pointer-events-none", theme.spotlight)} />

      <div className="relative p-6 flex flex-col gap-5">
        
        {/* Top Row: Icon & Tier Label */}
        <div className="flex items-start justify-between">
          <div className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl",
            theme.iconWrapper
          )}>
            <CrownStar weight="BoldDuotone" className="h-6 w-6" />
          </div>
          
          <span className={cn(
            "font-display text-[10px] font-black uppercase tracking-widest",
            theme.tierText
          )}>
            {tierLabel}
          </span>
        </div>

        {/* Content Block */}
        <div className="space-y-2">
          <h4 className={cn("font-display text-xl font-bold tracking-tight", theme.title)}>
            {title}
          </h4>
          <p className="text-sm text-muted-foreground leading-relaxed font-medium">
            {description}
          </p>
        </div>

        {/* CTA Button */}
        {onCtaClick && (
          <button
            onClick={onCtaClick}
            className={cn(
              "group relative w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all duration-300",
              "hover:-translate-y-0.5 active:translate-y-0",
              theme.button
            )}
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative z-10 flex items-center gap-2">
              {ctaLabel}
              <CrownStar weight="Bold" className="h-4 w-4" />
            </span>
          </button>
        )}
      </div>

      <Popover.Arrow
        className="fill-card/95"
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
