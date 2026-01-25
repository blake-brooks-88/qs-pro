import { beforeEach, describe, expect, it, vi } from "vitest";

const importAuthStore = async () => {
  const module = await import("./auth-store");
  return {
    useAuthStore: module.useAuthStore,
    storageKey: module.AUTH_STORE_STORAGE_KEY,
  };
};

describe("useAuthStore", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });

  it("should initialize with default values", async () => {
    const { useAuthStore } = await importAuthStore();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("should set authentication state", async () => {
    const { useAuthStore } = await importAuthStore();
    const user = {
      id: "u1",
      sfUserId: "sf1",
      email: "test@test.com",
      name: "Test",
    };
    const tenant = { id: "t1", eid: "e1", tssd: "tssd1" };

    useAuthStore.getState().setAuth(user, tenant);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(user);
    expect(state.tenant).toEqual(tenant);
    expect(state.csrfToken).toBeNull();
  });

  it("should logout and clear state", async () => {
    const { useAuthStore } = await importAuthStore();
    const user = {
      id: "u1",
      sfUserId: "sf1",
      email: "test@test.com",
      name: "Test",
    };
    const tenant = { id: "t1", eid: "e1", tssd: "tssd1" };

    useAuthStore.getState().setAuth(user, tenant, "csrf-123");
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.csrfToken).toBeNull();
  });

  it("persists auth state to sessionStorage and rehydrates on reload", async () => {
    const { useAuthStore, storageKey } = await importAuthStore();

    const user = {
      id: "u1",
      sfUserId: "sf1",
      email: "test@test.com",
      name: "Test",
    };
    const tenant = { id: "t1", eid: "e1", tssd: "tssd1" };

    useAuthStore.getState().setAuth(user, tenant, "csrf-123");

    const persisted = sessionStorage.getItem(storageKey);
    expect(persisted).toContain("csrf-123");
    expect(persisted).toContain("u1");

    vi.resetModules();

    const { useAuthStore: rehydratedStore } = await importAuthStore();
    const state = rehydratedStore.getState();

    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(user);
    expect(state.tenant).toEqual(tenant);
    expect(state.csrfToken).toBe("csrf-123");
  });

  it("removes persisted auth state on logout", async () => {
    const { useAuthStore, storageKey } = await importAuthStore();

    useAuthStore
      .getState()
      .setAuth(
        { id: "u1", sfUserId: "sf1", email: null, name: null },
        { id: "t1", eid: "e1", tssd: "tssd1" },
        "csrf-123",
      );

    expect(sessionStorage.getItem(storageKey)).not.toBeNull();

    useAuthStore.getState().logout();

    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
});
