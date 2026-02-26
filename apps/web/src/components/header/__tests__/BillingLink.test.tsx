import type { TenantFeaturesResponse } from "@qpp/shared-types";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BillingLink } from "@/components/header/BillingLink";

const mockMutate = vi.fn();

vi.mock("@/hooks/use-tenant-features", () => ({
  useTenantFeatures: vi.fn(),
}));

vi.mock("@/hooks/use-portal-session", () => ({
  usePortalSession: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

import { usePortalSession } from "@/hooks/use-portal-session";
import { useTenantFeatures } from "@/hooks/use-tenant-features";

const mockUseTenantFeatures = vi.mocked(useTenantFeatures);
const mockUsePortalSession = vi.mocked(usePortalSession);

function mockTier(tier: "free" | "pro" | "enterprise") {
  mockUseTenantFeatures.mockReturnValue({
    data: { tier } as TenantFeaturesResponse,
  } as UseQueryResult<TenantFeaturesResponse, Error>);
}

describe("BillingLink", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUsePortalSession.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as unknown as UseMutationResult<{ url: string }, Error, void, unknown>);
  });

  it("renders nothing for free tier", () => {
    mockTier("free");

    const { container } = render(<BillingLink />);

    expect(container.innerHTML).toBe("");
  });

  it("renders for pro tier", () => {
    mockTier("pro");

    render(<BillingLink />);

    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("clicking calls portal session mutation", async () => {
    const user = userEvent.setup();
    mockTier("pro");

    render(<BillingLink />);

    await user.click(screen.getByText("Billing"));

    expect(mockMutate).toHaveBeenCalledOnce();
  });
});
