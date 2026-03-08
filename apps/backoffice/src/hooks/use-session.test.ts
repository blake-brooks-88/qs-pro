import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSession = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => mockUseSession(),
  },
}));

import { useSession } from "@/hooks/use-session";

describe("useSession", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  it("should return loading state when session is pending", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.loading).toBe(true);
    expect(result.current.session).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("should return session and user when authenticated", () => {
    const sessionData = {
      session: { id: "sess-1", token: "tok-1" },
      user: {
        id: "user-1",
        email: "admin@qspro.dev",
        name: "Admin",
        role: "admin",
        twoFactorEnabled: true,
      },
    };
    mockUseSession.mockReturnValue({
      data: sessionData,
      isPending: false,
      error: null,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.loading).toBe(false);
    expect(result.current.session).toEqual(sessionData.session);
    expect(result.current.user).toEqual(sessionData.user);
    expect(result.current.role).toBe("admin");
  });

  it("should default role to viewer when role is undefined", () => {
    const sessionData = {
      session: { id: "sess-1", token: "tok-1" },
      user: {
        id: "user-1",
        email: "support@qspro.dev",
        name: "Support",
      },
    };
    mockUseSession.mockReturnValue({
      data: sessionData,
      isPending: false,
      error: null,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.role).toBe("viewer");
  });

  it("should expose twoFactorEnabled boolean", () => {
    const sessionData = {
      session: { id: "sess-1", token: "tok-1" },
      user: {
        id: "user-1",
        email: "admin@qspro.dev",
        name: "Admin",
        role: "editor",
        twoFactorEnabled: true,
      },
    };
    mockUseSession.mockReturnValue({
      data: sessionData,
      isPending: false,
      error: null,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.twoFactorEnabled).toBe(true);
  });

  it("should default twoFactorEnabled to false when not present", () => {
    const sessionData = {
      session: { id: "sess-1", token: "tok-1" },
      user: {
        id: "user-1",
        email: "new@qspro.dev",
        name: "New User",
        role: "viewer",
      },
    };
    mockUseSession.mockReturnValue({
      data: sessionData,
      isPending: false,
      error: null,
    });

    const { result } = renderHook(() => useSession());

    expect(result.current.twoFactorEnabled).toBe(false);
  });
});
