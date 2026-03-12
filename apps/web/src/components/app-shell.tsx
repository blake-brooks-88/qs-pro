import { Settings } from "@solar-icons/react";
import type { ReactNode } from "react";

import { BillingLink } from "@/components/header/BillingLink";
import { TierBadge } from "@/components/header/TierBadge";
import { UpgradeButton } from "@/components/header/UpgradeButton";
import { ThemeToggle } from "@/components/theme-toggle";
import { useRole } from "@/hooks/use-role";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
  topNotice?: ReactNode;
  brandingExtra?: ReactNode;
  onSettingsClick?: () => void;
}

export function AppShell({
  children,
  topNotice,
  brandingExtra,
  onSettingsClick,
}: AppShellProps) {
  const { isAdmin } = useRole();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground font-sans">
      <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary flex items-center justify-center shadow-sm">
            <span className="text-primary-foreground font-bold text-sm leading-none">
              Q
            </span>
          </div>
          <span className="font-display font-bold text-base tracking-tight">
            Query<span className="text-primary">++</span>
          </span>
          <TierBadge />
          {brandingExtra}
        </div>
        <div className="flex items-center gap-2">
          <UpgradeButton />
          <BillingLink />
          {isAdmin && onSettingsClick ? (
            <button
              type="button"
              onClick={onSettingsClick}
              title="Settings"
              className={cn(
                "h-8 w-8 flex items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors",
                "hover:text-foreground hover:bg-muted",
              )}
            >
              <Settings size={16} />
            </button>
          ) : null}
          <ThemeToggle />
        </div>
      </header>
      {topNotice ?? null}
      <main className="flex-1 flex flex-col min-h-0 relative z-20">
        {children}
      </main>
    </div>
  );
}
