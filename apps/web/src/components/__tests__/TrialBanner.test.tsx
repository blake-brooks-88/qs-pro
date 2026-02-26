import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrialBanner } from "@/components/TrialBanner";

describe("TrialBanner", () => {
  const mockOnDismiss = vi.fn();
  const pricingUrl = "https://queryplusplus.com/pricing?eid=test-eid";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders countdown text for multiple days remaining", () => {
    render(
      <TrialBanner
        daysRemaining={3}
        pricingUrl={pricingUrl}
        onDismiss={mockOnDismiss}
      />,
    );

    expect(
      screen.getByText("Your Pro trial ends in 3 days."),
    ).toBeInTheDocument();
  });

  it('renders "tomorrow" when 1 day remaining', () => {
    render(
      <TrialBanner
        daysRemaining={1}
        pricingUrl={pricingUrl}
        onDismiss={mockOnDismiss}
      />,
    );

    expect(
      screen.getByText("Your Pro trial ends tomorrow."),
    ).toBeInTheDocument();
  });

  it('renders "today" when 0 days remaining', () => {
    render(
      <TrialBanner
        daysRemaining={0}
        pricingUrl={pricingUrl}
        onDismiss={mockOnDismiss}
      />,
    );

    expect(screen.getByText("Your Pro trial ends today.")).toBeInTheDocument();
  });

  it("opens pricing page in new tab when View Plans is clicked", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <TrialBanner
        daysRemaining={3}
        pricingUrl={pricingUrl}
        onDismiss={mockOnDismiss}
      />,
    );

    await user.click(screen.getByText("View Plans"));

    expect(openSpy).toHaveBeenCalledWith(
      pricingUrl,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("calls onDismiss when dismiss button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <TrialBanner
        daysRemaining={3}
        pricingUrl={pricingUrl}
        onDismiss={mockOnDismiss}
      />,
    );

    await user.click(screen.getByLabelText("Dismiss banner"));

    expect(mockOnDismiss).toHaveBeenCalledOnce();
  });
});
