import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InviteUserDialog } from "./InviteUserDialog";

const mocks = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("../hooks/use-backoffice-users", () => ({
  useInviteUser: () => ({ mutate: mocks.mutateMock, isPending: false }),
}));

vi.mock("sonner", () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
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

describe("InviteUserDialog", () => {
  it("validates password length and calls invite mutation on success", async () => {
    const onOpenChange = vi.fn();

    mocks.mutateMock.mockImplementationOnce(
      (_vars: unknown, opts: { onSuccess?: () => void }) => {
        opts.onSuccess?.();
      },
    );

    render(<InviteUserDialog open onOpenChange={onOpenChange} />);

    await userEvent.type(screen.getByLabelText("Email"), "user@company.com");
    await userEvent.type(screen.getByLabelText("Name"), "User");
    await userEvent.type(screen.getByLabelText("Temporary Password"), "short");

    await userEvent.click(screen.getByRole("button", { name: "Invite User" }));
    expect(mocks.toastError).toHaveBeenCalledWith(
      "Password must be between 16 and 128 characters",
    );

    const passwordInput = screen.getByLabelText("Temporary Password");
    await userEvent.clear(passwordInput);
    await userEvent.type(passwordInput, "ValidPassword123456");

    await userEvent.click(screen.getByRole("button", { name: "Invite User" }));
    expect(mocks.mutateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@company.com",
        name: "User",
        role: "viewer",
      }),
      expect.any(Object),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      "User invited. Share temporary password securely.",
    );
  });
});
