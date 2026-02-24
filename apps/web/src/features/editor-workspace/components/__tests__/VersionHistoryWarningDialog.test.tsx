import { fireEvent, render, screen } from "@testing-library/react";
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

  it("calls onContinueWithoutSaving when Continue Without Saving is clicked", () => {
    const onContinueWithoutSaving = vi.fn();

    render(
      <VersionHistoryWarningDialog
        {...defaultProps}
        onContinueWithoutSaving={onContinueWithoutSaving}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /continue without saving/i }),
    );

    expect(onContinueWithoutSaving).toHaveBeenCalledTimes(1);
  });

  it("calls onSaveAndContinue when Save & Continue is clicked", () => {
    const onSaveAndContinue = vi.fn();

    render(
      <VersionHistoryWarningDialog
        {...defaultProps}
        onSaveAndContinue={onSaveAndContinue}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /save & continue/i }));

    expect(onSaveAndContinue).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();

    render(
      <VersionHistoryWarningDialog {...defaultProps} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel when dialog is dismissed via close button", () => {
    const onCancel = vi.fn();

    render(
      <VersionHistoryWarningDialog {...defaultProps} onCancel={onCancel} />,
    );

    const closeButton = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
