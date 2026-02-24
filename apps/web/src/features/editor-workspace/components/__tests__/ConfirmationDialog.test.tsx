import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmationDialog } from "../ConfirmationDialog";

describe("ConfirmationDialog", () => {
  const defaultProps = {
    isOpen: true,
    title: "Test Title",
    description: "Test description",
    onClose: vi.fn(),
    onConfirm: vi.fn(),
  };

  it("ConfirmationDialog_DangerVariant_RendersDangerStyling", () => {
    // Arrange
    render(<ConfirmationDialog {...defaultProps} variant="danger" />);

    // Assert
    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toHaveClass("bg-error");
  });

  it("ConfirmationDialog_WarningVariant_RendersWarningStyling", () => {
    // Arrange
    render(<ConfirmationDialog {...defaultProps} variant="warning" />);

    // Assert
    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toHaveClass("bg-warning");
  });

  it("ConfirmationDialog_InfoVariant_RendersInfoStyling", () => {
    // Arrange
    render(<ConfirmationDialog {...defaultProps} variant="info" />);

    // Assert
    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toHaveClass("bg-primary");
  });

  it("ConfirmationDialog_OnConfirmClick_CallsBothOnConfirmAndOnClose", () => {
    // Arrange
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmationDialog
        {...defaultProps}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    // Assert
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ConfirmationDialog_OnCancelClick_CallsOnClose", () => {
    // Arrange
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmationDialog
        {...defaultProps}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    // Act
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Assert
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
