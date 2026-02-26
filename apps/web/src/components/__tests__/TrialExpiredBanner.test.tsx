import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrialExpiredBanner } from "@/components/TrialExpiredBanner";

describe("TrialExpiredBanner", () => {
  const mockOnDismiss = vi.fn();
  const pricingUrl = "https://queryplusplus.com/pricing?eid=test-eid";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders expiry text", () => {
    render(
      <TrialExpiredBanner pricingUrl={pricingUrl} onDismiss={mockOnDismiss} />,
    );

    expect(screen.getByText("Your Pro trial has ended.")).toBeInTheDocument();
  });

  it("opens pricing page in new tab when View Plans is clicked", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <TrialExpiredBanner pricingUrl={pricingUrl} onDismiss={mockOnDismiss} />,
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
      <TrialExpiredBanner pricingUrl={pricingUrl} onDismiss={mockOnDismiss} />,
    );

    await user.click(screen.getByLabelText("Dismiss banner"));

    expect(mockOnDismiss).toHaveBeenCalledOnce();
  });
});
