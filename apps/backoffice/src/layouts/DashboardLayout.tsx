import {
  Buildings,
  DocumentText,
  HamburgerMenu,
  Logout,
  Settings,
} from "@solar-icons/react";
import { type ReactNode, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";

interface NavItem {
  label: string;
  to: string;
  icon: ReactNode;
  minRole?: "editor" | "admin";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Tenants", to: "/tenants", icon: <Buildings size={20} /> },
  { label: "Invoicing", to: "/invoicing", icon: <DocumentText size={20} /> },
  {
    label: "Settings",
    to: "/settings",
    icon: <Settings size={20} />,
    minRole: "admin",
  },
];

const ROLE_HIERARCHY = { viewer: 0, editor: 1, admin: 2 } as const;

export function DashboardLayout() {
  const { user, role } = useSession();
  const { sidebarCollapsed, toggleSidebar } = useUiStore();
  const navigate = useNavigate();

  const handleSignOut = useCallback(async () => {
    await authClient.signOut();
    navigate("/login");
  }, [navigate]);

  const visibleNavItems = NAV_ITEMS.filter(
    (item) =>
      !item.minRole ||
      ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[item.minRole],
  );

  return (
    <div className="flex h-screen bg-background">
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          {!sidebarCollapsed && (
            <span className="font-heading text-lg font-bold text-foreground">
              QS Pro
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("shrink-0", sidebarCollapsed ? "mx-auto" : "ml-auto")}
            onClick={toggleSidebar}
          >
            <HamburgerMenu size={18} />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  sidebarCollapsed && "justify-center px-0",
                )
              }
            >
              {item.icon}
              {!sidebarCollapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {user?.name ?? "User"}
                </p>
                <Badge variant="secondary" className="mt-0.5 text-xs">
                  {role}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-foreground"
                onClick={handleSignOut}
              >
                <Logout size={18} />
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="mx-auto text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <Logout size={18} />
            </Button>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
