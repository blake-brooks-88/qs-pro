import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/store/auth-store";
import { createTenantStub, createUserStub } from "@/test/stubs";

import { useRole } from "../use-role";

function setAuthUser(role: "owner" | "admin" | "member") {
  useAuthStore.setState({
    user: createUserStub({ role }),
    tenant: createTenantStub(),
    isAuthenticated: true,
  });
}

describe("useRole", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      tenant: null,
      isAuthenticated: false,
    });
  });

  it("returns isAdmin false and isOwner false for member role", () => {
    setAuthUser("member");

    const { result } = renderHook(() => useRole());

    expect(result.current.role).toBe("member");
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isOwner).toBe(false);
  });

  it("returns isAdmin true and isOwner false for admin role", () => {
    setAuthUser("admin");

    const { result } = renderHook(() => useRole());

    expect(result.current.role).toBe("admin");
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isOwner).toBe(false);
  });

  it("returns isAdmin true and isOwner true for owner role", () => {
    setAuthUser("owner");

    const { result } = renderHook(() => useRole());

    expect(result.current.role).toBe("owner");
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isOwner).toBe(true);
  });

  it("defaults to member behavior when user is null", () => {
    const { result } = renderHook(() => useRole());

    expect(result.current.role).toBe("member");
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isOwner).toBe(false);
  });
});
