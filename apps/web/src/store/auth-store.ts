import { create } from "zustand";

export interface User {
  id: string;
  sfUserId: string;
  email: string | null;
  name: string | null;
}

export interface Tenant {
  id: string;
  eid: string;
  tssd: string;
}

interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  csrfToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, tenant: Tenant, csrfToken?: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  tenant: null,
  csrfToken: null,
  isAuthenticated: false,
  setAuth: (user, tenant, csrfToken) =>
    set({
      user,
      tenant,
      csrfToken: csrfToken ?? null,
      isAuthenticated: true,
    }),
  logout: () =>
    set({ user: null, tenant: null, csrfToken: null, isAuthenticated: false }),
}));
