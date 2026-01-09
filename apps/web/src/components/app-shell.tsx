import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
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
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 flex flex-col min-h-0 relative z-20">{children}</main>
    </div>
  );
}
