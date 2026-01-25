import { create } from "zustand";
import type { StateStorage } from "zustand/middleware";
import { createJSONStorage, persist } from "zustand/middleware";

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

const storage: StateStorage = {
  getItem: (name) => {
    if (typeof sessionStorage === "undefined") {
      return null;
    }
    return sessionStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.removeItem(name);
  },
};

export const AUTH_STORE_STORAGE_KEY = "qpp-auth";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
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
      logout: () => {
        set({
          user: null,
          tenant: null,
          csrfToken: null,
          isAuthenticated: false,
        });
        storage.removeItem(AUTH_STORE_STORAGE_KEY);
      },
    }),
    {
      name: AUTH_STORE_STORAGE_KEY,
      storage: createJSONStorage(() => storage),
      partialize: ({ user, tenant, csrfToken, isAuthenticated }) => ({
        user,
        tenant,
        csrfToken,
        isAuthenticated,
      }),
    },
  ),
);
