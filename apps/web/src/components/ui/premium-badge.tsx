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
  isOpen?: boolean;
}

const PremiumPopoverContent = React.forwardRef<
  React.ElementRef<typeof Popover.Content>,
  PremiumPopoverContentProps & React.ComponentPropsWithoutRef<typeof Popover.Content>
>(({ tier, title, description, ctaLabel = "Upgrade Now", onCtaClick, isOpen = true, ...props }, ref) => {
  const tierLabel = tier === "enterprise" ? "Enterprise" : "Pro";
  const isPro = tier === "pro";

  // Option 1: Prismatic Floating Icon Theme
  const theme = isPro
    ? {
        // Pro: Energetic Orange/Pink
        wrapper: "border-pro-badge-bg/10 shadow-[0_20px_40px_-12px_var(--color-pro-shadow)]",
        spotlight: "bg-pro-badge-bg", // Used in opacity layer
        icon: "text-pro-badge-bg drop-shadow-[0_4px_12px_rgba(255,159,28,0.4)]", // Orange glow
        title: "text-foreground",
        tierText: "text-pro-badge-bg",
        button: "bg-gradient-to-r from-pro-badge-bg to-pro-badge-accent text-white shadow-lg shadow-pro-badge-bg/25 hover:shadow-pro-badge-bg/40",
      }
    : {
        // Enterprise: Regal Purple/Gold
        wrapper: "border-enterprise-badge-accent/20 shadow-[0_20px_40px_-12px_var(--color-enterprise-shadow)]",
        spotlight: "bg-enterprise-badge-accent", // Lighter purple for glow
        icon: "text-enterprise-badge-icon drop-shadow-[0_4px_12px_rgba(252,211,77,0.4)]", // Gold glow
        title: "text-foreground",
        tierText: "text-enterprise-badge-accent",
        button: "bg-gradient-to-r from-enterprise-badge-bg to-enterprise-badge-accent text-white shadow-lg shadow-enterprise-badge-bg/25 hover:shadow-enterprise-badge-bg/40",
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
            initial={{ opacity: 0, scale: 0.96, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 4 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 30,
            }}
            className={cn(
              "z-[9999] w-[320px] overflow-hidden rounded-2xl border bg-card/95 p-0 backdrop-blur-2xl outline-none",
              theme.wrapper
            )}
          >
            {/* --- Prismatic Spotlight Effect --- */}
            {/* A large, soft gradient orb positioned behind the icon area */}
            <div 
              className={cn(
                "absolute -left-16 -top-16 h-48 w-48 rounded-full blur-3xl opacity-15 pointer-events-none",
                theme.spotlight
              )} 
            />
            
            {/* Secondary subtle light leak from bottom right */}
            <div className={cn(
              "absolute -bottom-10 -right-10 h-32 w-32 rounded-full blur-2xl opacity-5 pointer-events-none",
              theme.spotlight
            )} />

            {/* Subtle Watermark - Top Right Filler */}
            <div className="absolute -right-6 -top-6 pointer-events-none select-none opacity-[0.03]">
              <CrownStar
                weight="Duotone"
                className={cn(
                  "h-40 w-40 -rotate-12 transform-gpu",
                  isPro ? "text-pro-badge-bg" : "text-enterprise-badge-icon"
                )}
              />
            </div>

            <div className="relative p-6 flex flex-col">
              
              {/* Header: Tier Label & Close/Action Area */}
              <div className="flex items-center justify-between mb-4">
                 <span className={cn(
                  "font-display text-[10px] font-black uppercase tracking-widest opacity-80",
                  theme.tierText
                )}>
                  {tierLabel} Access
                </span>
                {/* Optional: We could add a close button here if needed, but per "Membership Card" style, we usually keep it clean */}
              </div>

              {/* Hero: The Floating Prismatic Icon */}
              <div className="relative mb-6 flex justify-start">
                 <motion.div
                    animate={{ 
                      y: [0, -6, 0],
                      rotate: [0, 1, 0, -1, 0]
                    }}
                    transition={{
                      duration: 5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                 >
                    <CrownStar 
                      weight="BoldDuotone" 
                      className={cn("h-14 w-14 transition-all duration-300", theme.icon)} 
                    />
                 </motion.div>
              </div>

              {/* Content Block */}
              <div className="space-y-2 mb-6">
                <h4 className={cn("font-display text-lg font-bold tracking-tight", theme.title)}>
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
                    "group relative w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all duration-300",
                    "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99]",
                    theme.button
                  )}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {ctaLabel}
                    <motion.span
                      animate={{ x: [0, 3, 0] }}
                      transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    >
                      <CrownStar weight="Bold" className="h-4 w-4" />
                    </motion.span>
                  </span>
                  {/* Internal Shimmer */}
                  <div className="absolute inset-0 rounded-xl overflow-hidden">
                    <div className="absolute top-0 left-[-100%] h-full w-1/2 -skew-x-12 bg-white/20 blur-md transition-all duration-700 group-hover:left-[200%]" />
                  </div>
                </button>
              )}
            </div>
          </motion.div>
        </Popover.Content>
      )}
    </AnimatePresence>
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
