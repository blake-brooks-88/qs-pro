import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseSession = vi.fn();

vi.mock("@/hooks/use-session", () => ({
  useSession: () => mockUseSession(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid="navigate" data-to={to} />
    ),
  };
});

import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";

describe("ProtectedRoute", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
  });

  it("should show loading spinner when session is loading", () => {
    mockUseSession.mockReturnValue({
      session: null,
      loading: true,
      role: "viewer",
      twoFactorEnabled: false,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("should redirect to /login when no session exists", () => {
    mockUseSession.mockReturnValue({
      session: null,
      loading: false,
      role: "viewer",
      twoFactorEnabled: false,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    const navigate = screen.getByTestId("navigate");
    expect(navigate).toHaveAttribute("data-to", "/login");
  });

  it("should redirect to /2fa-setup when 2FA is not enabled", () => {
    mockUseSession.mockReturnValue({
      session: { id: "sess-1" },
      loading: false,
      role: "viewer",
      twoFactorEnabled: false,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    const navigate = screen.getByTestId("navigate");
    expect(navigate).toHaveAttribute("data-to", "/2fa-setup");
  });

  it("should render children when session exists and 2FA is enabled", () => {
    mockUseSession.mockReturnValue({
      session: { id: "sess-1" },
      loading: false,
      role: "viewer",
      twoFactorEnabled: true,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Protected Content")).toBeInTheDocument();
  });

  it("should show access denied when role is insufficient", () => {
    mockUseSession.mockReturnValue({
      session: { id: "sess-1" },
      loading: false,
      role: "viewer",
      twoFactorEnabled: true,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRole="admin">
          <div>Admin Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
    expect(screen.getByText("Access Denied")).toBeInTheDocument();
  });

  it("should allow access when role is sufficient", () => {
    mockUseSession.mockReturnValue({
      session: { id: "sess-1" },
      loading: false,
      role: "admin",
      twoFactorEnabled: true,
    });

    render(
      <MemoryRouter>
        <ProtectedRoute requiredRole="editor">
          <div>Editor Content</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );

    expect(screen.getByText("Editor Content")).toBeInTheDocument();
  });
});
