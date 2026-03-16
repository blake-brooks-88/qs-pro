import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { RoleDropdown } from "../components/RoleDropdown";

const defaultProps = {
  userId: "user-1",
  isCurrentUser: false,
  actorRole: "owner" as const,
  onRoleChange: vi.fn(),
  isLastAdmin: false,
};

describe("RoleDropdown", () => {
  it("renders no select when current role is owner", () => {
    render(<RoleDropdown {...defaultProps} currentRole="owner" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("renders a select when current role is not owner", () => {
    render(<RoleDropdown {...defaultProps} currentRole="admin" />);

    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("calls onRoleChange when selection changes", async () => {
    const onRoleChange = vi.fn();
    render(
      <RoleDropdown
        {...defaultProps}
        currentRole="member"
        onRoleChange={onRoleChange}
      />,
    );

    const select = screen.getByRole("combobox");
    await userEvent.selectOptions(select, "admin");

    expect(onRoleChange).toHaveBeenCalledWith("user-1", "admin");
  });

  it("disables select for last admin viewing own role", () => {
    render(
      <RoleDropdown
        {...defaultProps}
        currentRole="admin"
        isCurrentUser={true}
        isLastAdmin={true}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(select).toBeDisabled();
  });

  it("does not disable select for non-last-admin viewing own role", () => {
    render(
      <RoleDropdown
        {...defaultProps}
        currentRole="admin"
        isCurrentUser={true}
        isLastAdmin={false}
      />,
    );

    const select = screen.getByRole("combobox");
    expect(select).not.toBeDisabled();
  });
});
