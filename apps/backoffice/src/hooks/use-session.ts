import { authClient } from "@/lib/auth-client";

export type BackofficeRole = "viewer" | "editor" | "admin";

export function useSession() {
  const { data, isPending, error } = authClient.useSession();

  const session = data?.session ?? null;
  const user = data?.user ?? null;
  const role: BackofficeRole = (user?.role as BackofficeRole) ?? "viewer";
  const twoFactorEnabled = user?.twoFactorEnabled ?? false;

  return {
    session,
    user,
    role,
    twoFactorEnabled,
    loading: isPending,
    error,
  };
}
