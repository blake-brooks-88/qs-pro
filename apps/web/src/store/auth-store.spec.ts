import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth-store";

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset store before each test
    useAuthStore.setState({
      user: null,
      tenant: null,
      csrfToken: null,
      isAuthenticated: false,
    });
  });

  it("should initialize with default values", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  it("should set authentication state", () => {
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

  it("should logout and clear state", () => {
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
});
