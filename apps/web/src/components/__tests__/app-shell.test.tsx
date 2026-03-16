import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/header/TierBadge", () => ({ TierBadge: () => null }));
vi.mock("@/components/header/UpgradeButton", () => ({
  UpgradeButton: () => null,
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/settings/SettingsPage", () => ({
  SettingsPage: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h1>Settings</h1>
      <button type="button" onClick={onBack}>
        Back to Editor
      </button>
    </div>
  ),
}));

import { useAuthStore } from "@/store/auth-store";

import { AppShell } from "../app-shell";

describe("AppShell", () => {
  it("lets admins open Settings and return to the editor", async () => {
    useAuthStore.setState({
      user: {
        id: "u1",
        sfUserId: "sf1",
        role: "admin",
        email: null,
        name: null,
      },
      tenant: { id: "t1", eid: "eid", tssd: "tssd" },
      csrfToken: "csrf",
      isAuthenticated: true,
    });

    render(
      <AppShell>
        <div>Editor content</div>
      </AppShell>,
    );

    const button = screen.getByRole("button", { name: "Settings" });
    await userEvent.click(button);

    expect(
      screen.getByRole("heading", { name: "Settings" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Editor content")).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Back to Editor" }),
    );

    expect(screen.getByText("Editor content")).toBeInTheDocument();
  });

  it("calls onSettingsClick when provided", async () => {
    useAuthStore.setState({
      user: {
        id: "u1",
        sfUserId: "sf1",
        role: "admin",
        email: null,
        name: null,
      },
      tenant: { id: "t1", eid: "eid", tssd: "tssd" },
      csrfToken: "csrf",
      isAuthenticated: true,
    });

    const onSettingsClick = vi.fn();

    render(
      <AppShell onSettingsClick={onSettingsClick}>
        <div>Editor content</div>
      </AppShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));

    expect(onSettingsClick).toHaveBeenCalledOnce();
    expect(screen.getByText("Editor content")).toBeInTheDocument();
  });

  it("hides the Settings button for non-admin users", () => {
    useAuthStore.setState({
      user: {
        id: "u1",
        sfUserId: "sf1",
        role: "member",
        email: null,
        name: null,
      },
      tenant: { id: "t1", eid: "eid", tssd: "tssd" },
      csrfToken: "csrf",
      isAuthenticated: true,
    });

    render(
      <AppShell>
        <div>Editor content</div>
      </AppShell>,
    );

    expect(
      screen.queryByRole("button", { name: "Settings" }),
    ).not.toBeInTheDocument();
  });
});
