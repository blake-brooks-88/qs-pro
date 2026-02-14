import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VersionHistoryWarningDialog } from "../VersionHistoryWarningDialog";

describe("VersionHistoryWarningDialog", () => {
  const defaultProps = {
    open: true,
    onCancel: vi.fn(),
    onContinueWithoutSaving: vi.fn(),
    onSaveAndContinue: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog content when open is true", () => {
    render(<VersionHistoryWarningDialog {...defaultProps} />);

    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
    expect(
      screen.getByText(/Would you like to save before viewing version history/),
    ).toBeInTheDocument();
  });

  it("does not render dialog content when open is false", () => {
    render(<VersionHistoryWarningDialog {...defaultProps} open={false} />);

    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
  });

  it("calls onContinueWithoutSaving when Continue Without Saving is clicked", async () => {
    const user = userEvent.setup();
    const onContinueWithoutSaving = vi.fn();

    render(
      <VersionHistoryWarningDialog
        {...defaultProps}
        onContinueWithoutSaving={onContinueWithoutSaving}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /continue without saving/i }),
    );

    expect(onContinueWithoutSaving).toHaveBeenCalledTimes(1);
  });

  it("calls onSaveAndContinue when Save & Continue is clicked", async () => {
    const user = userEvent.setup();
    const onSaveAndContinue = vi.fn();

    render(
      <VersionHistoryWarningDialog
        {...defaultProps}
        onSaveAndContinue={onSaveAndContinue}
      />,
    );

    await user.click(screen.getByRole("button", { name: /save & continue/i }));

    expect(onSaveAndContinue).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <VersionHistoryWarningDialog {...defaultProps} onCancel={onCancel} />,
    );

    await user.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when dialog is dismissed via close button", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <VersionHistoryWarningDialog {...defaultProps} onCancel={onCancel} />,
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    await user.click(closeButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
