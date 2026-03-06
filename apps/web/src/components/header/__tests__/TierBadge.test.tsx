import type { TenantFeaturesResponse } from "@qpp/shared-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TierBadge } from "@/components/header/TierBadge";

vi.mock("@/hooks/use-tenant-features", () => ({
  useTenantFeatures: vi.fn(),
}));

import { useTenantFeatures } from "@/hooks/use-tenant-features";

const mockUseTenantFeatures = vi.mocked(useTenantFeatures);

function mockTier(tier: "free" | "pro" | "enterprise") {
  mockUseTenantFeatures.mockReturnValue({
    data: { tier } as TenantFeaturesResponse,
  } as UseQueryResult<TenantFeaturesResponse, Error>);
}

describe("TierBadge", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders "Free" badge for free tier', () => {
    mockTier("free");

    render(<TierBadge />);

    expect(screen.getByText("Free")).toBeInTheDocument();
  });

  it('renders "Pro" badge for pro tier', () => {
    mockTier("pro");

    render(<TierBadge />);

    expect(screen.getByText("Pro")).toBeInTheDocument();
  });

  it('renders "Enterprise" badge for enterprise tier', () => {
    mockTier("enterprise");

    render(<TierBadge />);

    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });
});
