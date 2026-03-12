import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { DashboardLayout } from "./DashboardLayout";

const { navigateMock, signOutMock, useSessionMock } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  signOutMock: vi.fn().mockResolvedValue(undefined),
  useSessionMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/hooks/use-session", () => ({
  useSession: useSessionMock,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: signOutMock,
  },
}));

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/tenants"]}>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route path="tenants" element={<div>Tenants Outlet</div>} />
          <Route path="settings" element={<div>Settings Outlet</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("DashboardLayout", () => {
  it("hides Settings nav for non-admin roles", () => {
    useSessionMock.mockReturnValue({
      user: { name: "Viewer" },
      role: "viewer",
    });
    renderLayout();

    expect(screen.getByText("Tenants")).toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("shows Settings nav for admin roles and signs out", async () => {
    useSessionMock.mockReturnValue({ user: { name: "Admin" }, role: "admin" });
    renderLayout();

    expect(screen.getByText("Settings")).toBeInTheDocument();

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    await userEvent.click(buttons[1] as HTMLElement);
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith("/login");
  });
});
