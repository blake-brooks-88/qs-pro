import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { cva, type VariantProps } from "class-variance-authority";
import { CrownStar } from "@solar-icons/react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const premiumBadgeVariants = cva(
  "inline-flex items-center justify-center rounded-full cursor-pointer transition-all duration-200",
  {
    variants: {
      tier: {
        pro: "bg-pro-badge-bg text-pro-badge-foreground animate-badge-pulse-pro hover:scale-110 hover:animate-none",
        enterprise:
          "bg-enterprise-badge-bg text-enterprise-badge-foreground animate-badge-pulse-enterprise hover:scale-110 hover:animate-none",
      },
      size: {
        sm: "h-4 w-4",
        md: "h-5 w-5",
        lg: "h-6 px-2 gap-1",
      },
      position: {
        "top-right": "absolute -top-1.5 -right-1.5 z-[100]",
        "top-left": "absolute -top-1.5 -left-1.5 z-[100]",
        inline: "relative shrink-0",
      },
    },
    defaultVariants: {
      tier: "pro",
      size: "md",
      position: "inline",
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
      sm: "h-2.5 w-2.5",
      md: "h-3 w-3",
      lg: "h-3.5 w-3.5",
    },
  },
  defaultVariants: {
    tier: "pro",
    size: "md",
  },
});

export interface PremiumBadgeProps extends VariantProps<
  typeof premiumBadgeVariants
> {
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
  isOpen?: boolean;
}

const PremiumPopoverContent = React.forwardRef<
  React.ElementRef<typeof Popover.Content>,
  PremiumPopoverContentProps &
    React.ComponentPropsWithoutRef<typeof Popover.Content>
>(
  (
    {
      tier,
      title,
      description,
      ctaLabel = "Upgrade Now",
      onCtaClick,
      isOpen = true,
      ...props
    },
    ref,
  ) => {
    const tierLabel = tier === "enterprise" ? "Enterprise" : "Pro";
    const isPro = tier === "pro";

    // Option 3: Holographic Lens Theme (Refined & Theme Aware)
    const theme = isPro
      ? {
          // Pro: Orange
          wrapper:
            "border-pro-badge-bg/20 shadow-xl dark:shadow-[0_0_50px_-15px_var(--color-pro-shadow)] bg-popover/95",
          lensRing:
            "border-pro-badge-bg/50 bg-pro-badge-bg/15 dark:border-pro-badge-bg/30 dark:bg-pro-badge-bg/10",
          lensGlow: "shadow-[0_0_20px_var(--color-pro-badge-bg)]",
          icon: "text-pro-badge-bg dark:drop-shadow-[0_0_12px_var(--color-pro-badge-bg)]",
          title: "text-popover-foreground",
          tierText: "text-pro-badge-bg",
          shimmer: "via-pro-badge-bg/10 dark:via-pro-badge-bg/20",
          descBorder: "from-pro-badge-bg/50 to-transparent",
          button:
            "bg-pro-badge-bg/5 hover:bg-pro-badge-bg/15 border border-pro-badge-bg/20 text-pro-badge-bg transition-all hover:shadow-[0_0_15px_-5px_var(--color-pro-badge-bg)]",
        }
      : {
          // Enterprise: Purple
          wrapper:
            "border-enterprise-badge-accent/20 shadow-xl dark:shadow-[0_0_50px_-15px_var(--color-enterprise-shadow)] bg-popover/95",
          lensRing:
            "border-enterprise-badge-icon/60 bg-enterprise-badge-icon/20 dark:border-enterprise-badge-icon/30 dark:bg-enterprise-badge-icon/15",
          lensGlow: "shadow-[0_0_20px_var(--color-enterprise-badge-accent)]",
          icon: "text-enterprise-badge-accent dark:drop-shadow-[0_0_15px_var(--color-enterprise-badge-accent)]",
          title: "text-popover-foreground",
          tierText: "text-enterprise-badge-accent",
          shimmer:
            "via-enterprise-badge-accent/10 dark:via-enterprise-badge-accent/20",
          descBorder: "from-enterprise-badge-accent/50 to-transparent",
          button:
            "bg-enterprise-badge-accent/5 hover:bg-enterprise-badge-accent/15 border border-enterprise-badge-accent/20 text-enterprise-badge-accent transition-all hover:shadow-[0_0_15px_-5px_var(--color-enterprise-badge-accent)]",
        };

    return (
      <AnimatePresence>
        {isOpen && (
          <Popover.Content
            ref={ref}
            asChild
            forceMount
            sideOffset={16}
            align="end"
            alignOffset={-12}
            collisionPadding={16}
            {...props}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className={cn(
                "group/card relative z-[9999] w-[340px] overflow-hidden rounded-xl border p-0 backdrop-blur-3xl outline-none",
                theme.wrapper,
              )}
            >
              {/* --- Recurring Holographic Shimmer --- */}
              <motion.div
                initial={{ x: "-200%" }}
                animate={{ x: "200%" }}
                transition={{
                  duration: 2,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 4,
                }}
                className={cn(
                  "absolute inset-0 z-0 bg-gradient-to-r from-transparent to-transparent -skew-x-12 opacity-30 pointer-events-none",
                  theme.shimmer,
                )}
              />

              {/* Grid Pattern Background (Adaptive Contrast) */}
              <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-border)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-border)_1px,transparent_1px)] opacity-40 dark:opacity-20 bg-[size:24px_24px] pointer-events-none" />

              <div className="relative z-10 p-5 flex flex-col gap-5">
                <div className="flex items-start gap-5">
                  {/* --- The "Reactor Core" Lens (Simplified) --- */}
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
                    {/* 1. Static Outer Ring (Subtle Pulse) */}
                    <motion.div
                      animate={{ opacity: [0.8, 1, 0.8], scale: [1, 1.02, 1] }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className={cn(
                        "absolute inset-0 rounded-full border",
                        theme.lensRing,
                      )}
                    />

                    {/* 2. Inner Glow Pulse (dark mode only) */}
                    <motion.div
                      animate={{
                        scale: [0.85, 1, 0.85],
                        opacity: [0.3, 0.6, 0.3],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                      className={cn(
                        "absolute inset-0 rounded-full blur-xl bg-current hidden dark:block dark:opacity-20",
                        isPro
                          ? "text-pro-badge-bg"
                          : "text-enterprise-badge-accent",
                      )}
                    />

                    {/* 3. Floating Icon - Bold in light, BoldDuotone in dark */}
                    <motion.div
                      animate={{ y: [-3, 3, -3] }}
                      transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    >
                      <CrownStar
                        weight="Bold"
                        className={cn(
                          "h-7 w-7 relative z-10 dark:hidden",
                          theme.icon,
                        )}
                      />
                      <CrownStar
                        weight="BoldDuotone"
                        className={cn(
                          "h-7 w-7 relative z-10 hidden dark:block",
                          theme.icon,
                        )}
                      />
                    </motion.div>
                  </div>

                  <div className="flex flex-col pt-1">
                    <span
                      className={cn(
                        "font-display text-[10px] font-black uppercase tracking-widest mb-1.5 opacity-90",
                        theme.tierText,
                      )}
                    >
                      {tierLabel}
                    </span>
                    <h4
                      className={cn(
                        "font-display text-lg font-bold tracking-tight leading-tight",
                        theme.title,
                      )}
                    >
                      {title}
                    </h4>
                  </div>
                </div>

                {/* --- System Output Description --- */}
                <div className="relative pl-3 py-1">
                  {/* Gradient Left Border */}
                  <div
                    className={cn(
                      "absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b",
                      theme.descBorder,
                    )}
                  />

                  <p className="text-xs text-muted-foreground font-mono leading-relaxed opacity-90">
                    {description}
                  </p>
                </div>

                {/* CTA Button */}
                {onCtaClick && (
                  <button
                    onClick={onCtaClick}
                    className={cn(
                      "relative w-full overflow-hidden flex items-center justify-center gap-2 rounded py-3 text-xs font-bold uppercase tracking-widest transition-all duration-300",
                      theme.button,
                    )}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      {ctaLabel}
                      <CrownStar weight="Bold" className="h-3 w-3" />
                    </span>
                  </button>
                )}
              </div>
            </motion.div>
          </Popover.Content>
        )}
      </AnimatePresence>
    );
  },
);
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
    const [isOpen, setIsOpen] = React.useState(false);
    const tierLabel = tier === "enterprise" ? "Enterprise" : "Pro";

    return (
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
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
        <Popover.Portal forceMount>
          <PremiumPopoverContent
            tier={tier ?? "pro"}
            title={title}
            description={description}
            ctaLabel={ctaLabel}
            onCtaClick={onCtaClick}
            isOpen={isOpen}
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
