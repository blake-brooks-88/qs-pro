import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Magnifer, CloseCircle } from "@solar-icons/react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/use-click-outside";

const sidebarSearchVariants = cva(
  "relative flex items-center w-full transition-all duration-200",
  {
    variants: {
      density: {
        default: "h-9",
        compact: "h-8",
        dense: "h-7",
      },
      variant: {
        default:
          "bg-muted/50 border border-transparent focus-within:border-primary/30 focus-within:bg-background focus-within:shadow-sm rounded-md",
        ghost: "bg-transparent border-none focus-within:bg-muted/30 rounded",
      },
    },
    defaultVariants: {
      density: "default",
      variant: "default",
    },
  },
);

export interface SidebarSearchProps
  extends
    React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof sidebarSearchVariants> {
  onClear?: () => void;
  showClear?: boolean;
  containerClassName?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const SidebarSearch = React.forwardRef<
  HTMLInputElement,
  SidebarSearchProps
>(
  (
    {
      className,
      containerClassName,
      density,
      variant,
      onClear,
      showClear,
      leftIcon,
      rightElement,
      ...props
    },
    ref,
  ) => {
    const hasValue = Boolean(props.value || props.defaultValue);
    const shouldShowClear = showClear ?? hasValue;

    return (
      <div
        className={cn(
          sidebarSearchVariants({ density, variant }),
          containerClassName,
        )}
      >
        <div className="absolute left-3 flex items-center pointer-events-none text-muted-foreground/60 group-focus-within:text-primary/70 transition-colors">
          {leftIcon ?? <Magnifer size={density === "dense" ? 14 : 16} />}
        </div>
        <input
          {...props}
          ref={ref}
          className={cn(
            "flex h-full w-full bg-transparent pl-10 pr-10 py-1 text-sm outline-none placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {shouldShowClear && (
            <button
              type="button"
              onClick={onClear}
              className="p-1 rounded-full hover:bg-muted-foreground/10 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              aria-label="Clear search"
            >
              <CloseCircle size={16} weight="Bold" />
            </button>
          )}
          {rightElement}
        </div>
      </div>
    );
  },
);

SidebarSearch.displayName = "SidebarSearch";

export interface SidebarSearchResultsProps {
  children: React.ReactNode;
  className?: string;
  isOpen?: boolean;
}

export const SidebarSearchResults = ({
  children,
  className,
  isOpen = false,
}: SidebarSearchResultsProps) => {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "absolute z-50 w-full mt-1 max-h-[300px] overflow-y-auto bg-popover text-popover-foreground border border-border shadow-lg rounded-md animate-in fade-in zoom-in-95 duration-100",
        className,
      )}
      role="listbox"
    >
      <div className="py-1">{children}</div>
    </div>
  );
};

export interface SidebarSearchResultItemProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  onMouseEnter?: () => void;
  className?: string;
  id?: string;
}

export const SidebarSearchResultItem = ({
  children,
  active,
  onClick,
  onMouseEnter,
  className,
  id,
}: SidebarSearchResultItemProps) => {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "px-3 py-2 text-xs cursor-pointer transition-colors",
        active
          ? "bg-surface-hover text-foreground font-medium"
          : "hover:bg-surface-hover text-foreground/90",
        className,
      )}
    >
      {children}
    </div>
  );
};

export interface SidebarSearchRootProps {
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export const SidebarSearchRoot = ({
  children,
  onOpenChange,
  className,
}: SidebarSearchRootProps) => {
  const containerRef = React.useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => {
    onOpenChange?.(false);
  });

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {children}
    </div>
  );
};
