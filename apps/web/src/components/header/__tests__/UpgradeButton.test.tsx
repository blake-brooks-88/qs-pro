import type { TenantFeaturesResponse } from "@qpp/shared-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpgradeButton } from "@/components/header/UpgradeButton";

vi.mock("@/hooks/use-tenant-features", () => ({
  useTenantFeatures: vi.fn(),
}));

vi.mock("@/store/pricing-overlay-store", () => ({
  usePricingOverlayStore: vi.fn(),
}));

import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { usePricingOverlayStore } from "@/store/pricing-overlay-store";

const mockUseTenantFeatures = vi.mocked(useTenantFeatures);
const mockUsePricingOverlayStore = vi.mocked(usePricingOverlayStore);

function mockTier(tier: "free" | "pro" | "enterprise") {
  mockUseTenantFeatures.mockReturnValue({
    data: { tier } as TenantFeaturesResponse,
  } as UseQueryResult<TenantFeaturesResponse, Error>);
}

describe("UpgradeButton", () => {
  const mockOpen = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockUsePricingOverlayStore.mockReturnValue(mockOpen);
  });

  it("renders for free tier", () => {
    mockTier("free");

    render(<UpgradeButton />);

    expect(screen.getByText("Upgrade")).toBeInTheDocument();
  });

  it("renders nothing for pro tier", () => {
    mockTier("pro");

    const { container } = render(<UpgradeButton />);

    expect(container.innerHTML).toBe("");
  });

  it('clicking opens pricing overlay with "header" source', async () => {
    const user = userEvent.setup();
    mockTier("free");

    render(<UpgradeButton />);

    await user.click(screen.getByText("Upgrade"));

    expect(mockOpen).toHaveBeenCalledWith("header");
  });
});
