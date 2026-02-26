import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradeModal } from "@/components/UpgradeModal";

describe("UpgradeModal", () => {
  const mockOnClose = vi.fn();
  const pricingUrl = "https://queryplusplus.com/pricing?eid=test-eid";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders modal content when open", () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={mockOnClose}
        pricingUrl={pricingUrl}
      />,
    );

    expect(screen.getByText("Unlock Query++ Pro")).toBeInTheDocument();
  });

  it("renders all Pro benefits", () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={mockOnClose}
        pricingUrl={pricingUrl}
      />,
    );

    expect(screen.getByText("Unlimited query runs")).toBeInTheDocument();
    expect(screen.getByText("Unlimited saved queries")).toBeInTheDocument();
    expect(screen.getByText("Query execution history")).toBeInTheDocument();
    expect(screen.getByText("Target DE runs")).toBeInTheDocument();
    expect(
      screen.getByText("Automation Studio integration"),
    ).toBeInTheDocument();
    expect(screen.getByText("Advanced autocomplete")).toBeInTheDocument();
    expect(
      screen.getByText("Code minimap and quick fixes"),
    ).toBeInTheDocument();
  });

  it("opens pricing page in new tab when Upgrade button is clicked", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(
      <UpgradeModal
        isOpen={true}
        onClose={mockOnClose}
        pricingUrl={pricingUrl}
      />,
    );

    fireEvent.click(screen.getByText("Upgrade to Pro"));

    expect(openSpy).toHaveBeenCalledWith(
      pricingUrl,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("calls onClose when Maybe later is clicked", () => {
    render(
      <UpgradeModal
        isOpen={true}
        onClose={mockOnClose}
        pricingUrl={pricingUrl}
      />,
    );

    fireEvent.click(screen.getByText("Maybe later"));

    expect(mockOnClose).toHaveBeenCalledOnce();
  });

  it("does not render content when closed", () => {
    render(
      <UpgradeModal
        isOpen={false}
        onClose={mockOnClose}
        pricingUrl={pricingUrl}
      />,
    );

    expect(screen.queryByText("Unlock Query++ Pro")).not.toBeInTheDocument();
  });
});
