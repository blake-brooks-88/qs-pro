import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StaleWarningDialog } from "../StaleWarningDialog";

describe("StaleWarningDialog", () => {
  const defaultProps = {
    open: true,
    conflictingUserName: "Alice",
    onOverwrite: vi.fn(),
    onReload: vi.fn(),
    onCancel: vi.fn(),
  };

  it("renders dialog when open is true", () => {
    render(<StaleWarningDialog {...defaultProps} />);

    expect(
      screen.getByText("Query modified by another user"),
    ).toBeInTheDocument();
  });

  it("shows conflicting user name in message", () => {
    render(
      <StaleWarningDialog {...defaultProps} conflictingUserName="Alice" />,
    );

    expect(
      screen.getByText(/Alice modified this query since you opened it/),
    ).toBeInTheDocument();
  });

  it("shows generic message when conflicting user name is null", () => {
    render(<StaleWarningDialog {...defaultProps} conflictingUserName={null} />);

    expect(
      screen.getByText(/Another user modified this query since you opened it/),
    ).toBeInTheDocument();
  });

  it("Overwrite with Mine button calls onOverwrite", () => {
    const onOverwrite = vi.fn();
    render(<StaleWarningDialog {...defaultProps} onOverwrite={onOverwrite} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Overwrite with Mine" }),
    );

    expect(onOverwrite).toHaveBeenCalledTimes(1);
  });

  it("Reload Their Changes button calls onReload", () => {
    const onReload = vi.fn();
    render(<StaleWarningDialog {...defaultProps} onReload={onReload} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Reload Their Changes" }),
    );

    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("Cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(<StaleWarningDialog {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does not render dialog content when open is false", () => {
    render(<StaleWarningDialog {...defaultProps} open={false} />);

    expect(
      screen.queryByText("Query modified by another user"),
    ).not.toBeInTheDocument();
  });
});
