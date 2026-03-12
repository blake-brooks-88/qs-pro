import { type BackofficeRole, useSession } from "@/hooks/use-session";

const ROLE_HIERARCHY: Record<BackofficeRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

export function usePermissions() {
  const { role } = useSession();

  const isAtLeast = (requiredRole: BackofficeRole): boolean =>
    ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[requiredRole];

  return {
    role,
    canView: isAtLeast("viewer"),
    canEdit: isAtLeast("editor"),
    canAdmin: isAtLeast("admin"),
    isAtLeast,
  };
}
