import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrialExpiredBanner } from "@/components/TrialExpiredBanner";

describe("TrialExpiredBanner", () => {
  const mockOnDismiss = vi.fn();
  const mockOnViewPlans = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders expiry text", () => {
    render(
      <TrialExpiredBanner
        onViewPlans={mockOnViewPlans}
        onDismiss={mockOnDismiss}
      />,
    );

    expect(screen.getByText("Your Pro trial has ended.")).toBeInTheDocument();
  });

  it("calls onViewPlans when View Plans is clicked", async () => {
    const user = userEvent.setup();

    render(
      <TrialExpiredBanner
        onViewPlans={mockOnViewPlans}
        onDismiss={mockOnDismiss}
      />,
    );

    await user.click(screen.getByText("View Plans"));

    expect(mockOnViewPlans).toHaveBeenCalledOnce();
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <TrialExpiredBanner
        onViewPlans={mockOnViewPlans}
        onDismiss={mockOnDismiss}
      />,
    );

    await user.click(screen.getByLabelText("Dismiss banner"));

    expect(mockOnDismiss).toHaveBeenCalledOnce();
  });
});
