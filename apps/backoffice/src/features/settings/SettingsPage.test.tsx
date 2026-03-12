import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

vi.mock("./hooks/use-backoffice-users", () => ({
  useBackofficeUsers: () => ({ data: { users: [], total: 0 }, isLoading: false }),
}));

vi.mock("./components/UserManagementCard", () => ({
  UserManagementCard: () => <div>User Management</div>,
}));

vi.mock("./components/InviteUserDialog", () => ({
  InviteUserDialog: ({ open }: { open: boolean }) =>
    open ? <div>Invite Dialog</div> : null,
}));

describe("SettingsPage", () => {
  it("opens invite dialog", async () => {
    render(<SettingsPage />);
    await userEvent.click(screen.getByRole("button", { name: "Invite User" }));
    expect(screen.getByText("Invite Dialog")).toBeInTheDocument();
  });
});

