import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UserManagementCard } from "./UserManagementCard";

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  changeRoleMutate: vi.fn(),
  banMutate: vi.fn(),
  unbanMutate: vi.fn(),
  resetMutate: vi.fn(),
  deleteMutate: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock("@/hooks/use-session", () => ({
  useSession: () => ({ user: { id: "self" } }),
}));

vi.mock("../hooks/use-backoffice-users", () => ({
  useChangeUserRole: () => ({
    mutate: mocks.changeRoleMutate,
    isPending: false,
  }),
  useBanUser: () => ({ mutate: mocks.banMutate, isPending: false }),
  useUnbanUser: () => ({ mutate: mocks.unbanMutate, isPending: false }),
  useResetPassword: () => ({ mutate: mocks.resetMutate, isPending: false }),
  useDeleteUser: () => ({ mutate: mocks.deleteMutate, isPending: false }),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select {...props} />
  ),
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("UserManagementCard", () => {
  it("shows loading state", () => {
    render(<UserManagementCard users={[]} isLoading />);
    expect(screen.getByText("Loading users...")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(<UserManagementCard users={[]} isLoading={false} />);
    expect(screen.getByText("No users found.")).toBeInTheDocument();
  });

  it("changes a user role via confirmation dialog", async () => {
    mocks.changeRoleMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.(),
    );

    render(
      <UserManagementCard
        users={[
          {
            id: "u1",
            name: "User",
            email: "u@test.com",
            role: "viewer",
            banned: false,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    await userEvent.selectOptions(selects[0] as HTMLElement, "admin");

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.changeRoleMutate).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Role updated to admin");
  });

  it("validates reset password and shows toast on invalid input", async () => {
    render(
      <UserManagementCard
        users={[
          {
            id: "u1",
            name: "User",
            email: "u@test.com",
            role: "viewer",
            banned: false,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Reset Password" }),
    );
    await userEvent.type(screen.getByLabelText("New Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.toastError).toHaveBeenCalledWith(
      "Password must be between 16 and 128 characters",
    );
    expect(mocks.resetMutate).not.toHaveBeenCalled();
  });

  it("resets a user's password on valid input", async () => {
    mocks.resetMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.(),
    );

    render(
      <UserManagementCard
        users={[
          {
            id: "u1",
            name: "User",
            email: "u@test.com",
            role: "viewer",
            banned: false,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Reset Password" }),
    );
    await userEvent.type(
      screen.getByLabelText("New Password"),
      "ValidPassword123456",
    );
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.resetMutate).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "Password reset successfully",
    );
  });

  it("deletes a user via confirmation dialog", async () => {
    mocks.deleteMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.(),
    );

    render(
      <UserManagementCard
        users={[
          {
            id: "u1",
            name: "User",
            email: "u@test.com",
            role: "viewer",
            banned: false,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(mocks.deleteMutate).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("User deleted");
  });

  it("bans and unbans users via confirmation dialog", async () => {
    mocks.banMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.(),
    );
    mocks.unbanMutate.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => opts.onSuccess?.(),
    );

    const { rerender } = render(
      <UserManagementCard
        users={[
          {
            id: "u1",
            name: "User",
            email: "u@test.com",
            role: "viewer",
            banned: false,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ban" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.banMutate).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("User banned");

    rerender(
      <UserManagementCard
        users={[
          {
            id: "u1",
            name: "User",
            email: "u@test.com",
            role: "viewer",
            banned: true,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Unban" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mocks.unbanMutate).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("User unbanned");
  });

  it("disables self actions", () => {
    render(
      <UserManagementCard
        users={[
          {
            id: "self",
            name: "Me",
            email: "me@test.com",
            role: "admin",
            banned: false,
            createdAt: "2026-03-08T00:00:00Z",
          },
        ]}
        isLoading={false}
      />,
    );

    const selects = screen.getAllByRole("combobox");
    expect(selects[0]).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ban" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });
});
