import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { type BackofficeRole, useSession } from "@/hooks/use-session";

const ROLE_HIERARCHY: Record<BackofficeRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

interface ProtectedRouteProps {
  children: ReactNode;
  requiredRole?: BackofficeRole;
}

export function ProtectedRoute({
  children,
  requiredRole,
}: ProtectedRouteProps) {
  const { session, loading, role, twoFactorEnabled } = useSession();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!twoFactorEnabled) {
    return <Navigate to="/2fa-setup" replace />;
  }

  if (requiredRole && ROLE_HIERARCHY[role] < ROLE_HIERARCHY[requiredRole]) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 text-muted-foreground">
        <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
        <p>You do not have permission to view this page.</p>
      </div>
    );
  }

  return <>{children}</>;
}
