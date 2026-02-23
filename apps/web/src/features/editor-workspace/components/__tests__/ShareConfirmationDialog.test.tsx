import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShareConfirmationDialog } from "../ShareConfirmationDialog";

describe("ShareConfirmationDialog", () => {
  const defaultProps = {
    open: true,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    itemName: "Marketing Queries",
    itemType: "folder" as const,
  };

  it("renders correct message for folder sharing", () => {
    render(<ShareConfirmationDialog {...defaultProps} />);

    expect(
      screen.getByText(
        /Everyone in this BU will be able to view and edit all queries in "Marketing Queries"/,
      ),
    ).toBeInTheDocument();
  });

  it("renders correct message for query sharing", () => {
    render(
      <ShareConfirmationDialog
        {...defaultProps}
        itemType="query"
        itemName="My Query"
      />,
    );

    expect(
      screen.getByText(
        /Everyone in this BU will be able to view and edit "My Query"/,
      ),
    ).toBeInTheDocument();
  });

  it("Share button calls onConfirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ShareConfirmationDialog {...defaultProps} onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Share" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("Cancel button calls onCancel", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<ShareConfirmationDialog {...defaultProps} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("dialog shows item name in the title", () => {
    render(<ShareConfirmationDialog {...defaultProps} />);

    expect(
      screen.getByText(/Share "Marketing Queries" with your team/),
    ).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(<ShareConfirmationDialog {...defaultProps} open={false} />);

    expect(
      screen.queryByText(/Share "Marketing Queries" with your team/),
    ).not.toBeInTheDocument();
  });
});
