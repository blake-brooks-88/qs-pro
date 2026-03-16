import type { OrgRole } from "@qpp/shared-types";

import { useAuthStore } from "@/store/auth-store";

export function useRole(): {
  role: OrgRole;
  isAdmin: boolean;
  isOwner: boolean;
} {
  const role = useAuthStore((s) => s.user?.role ?? "member") as OrgRole;
  return {
    role,
    isAdmin: role === "admin" || role === "owner",
    isOwner: role === "owner",
  };
}
