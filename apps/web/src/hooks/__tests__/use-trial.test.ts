import type { TenantFeaturesResponse } from "@qpp/shared-types";
import type { UseQueryResult } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTrial } from "@/hooks/use-trial";
import { createTenantFeaturesStub } from "@/test/stubs";

vi.mock("@/hooks/use-tenant-features", () => ({
  useTenantFeatures: vi.fn(),
}));

import { useTenantFeatures } from "@/hooks/use-tenant-features";

const mockUseTenantFeatures = vi.mocked(useTenantFeatures);

function mockFeatures(
  data: TenantFeaturesResponse | undefined,
  isLoading = false,
) {
  mockUseTenantFeatures.mockReturnValue({
    data,
    isLoading,
  } as UseQueryResult<TenantFeaturesResponse, Error>);
}

describe("useTrial", () => {
  it("shows countdown when trial is active and daysRemaining <= 5", () => {
    mockFeatures(
      createTenantFeaturesStub({
        tier: "pro",
        trial: { active: true, daysRemaining: 3, endsAt: "2026-03-01T00:00:00Z" },
      }),
    );

    const { result } = renderHook(() => useTrial());

    expect(result.current.isTrialActive).toBe(true);
    expect(result.current.showCountdown).toBe(true);
    expect(result.current.daysRemaining).toBe(3);
    expect(result.current.isTrialExpired).toBe(false);
  });

  it("does not show countdown during quiet period (daysRemaining > 5)", () => {
    mockFeatures(
      createTenantFeaturesStub({
        tier: "pro",
        trial: { active: true, daysRemaining: 8, endsAt: "2026-03-05T00:00:00Z" },
      }),
    );

    const { result } = renderHook(() => useTrial());

    expect(result.current.isTrialActive).toBe(true);
    expect(result.current.showCountdown).toBe(false);
    expect(result.current.daysRemaining).toBe(8);
  });

  it("shows countdown at boundary (daysRemaining === 5)", () => {
    mockFeatures(
      createTenantFeaturesStub({
        tier: "pro",
        trial: { active: true, daysRemaining: 5, endsAt: "2026-03-03T00:00:00Z" },
      }),
    );

    const { result } = renderHook(() => useTrial());

    expect(result.current.showCountdown).toBe(true);
    expect(result.current.daysRemaining).toBe(5);
  });

  it("does not show countdown just outside boundary (daysRemaining === 6)", () => {
    mockFeatures(
      createTenantFeaturesStub({
        tier: "pro",
        trial: { active: true, daysRemaining: 6, endsAt: "2026-03-04T00:00:00Z" },
      }),
    );

    const { result } = renderHook(() => useTrial());

    expect(result.current.showCountdown).toBe(false);
    expect(result.current.daysRemaining).toBe(6);
  });

  it("shows trial expired when trial is inactive and tier is free", () => {
    mockFeatures(
      createTenantFeaturesStub({
        tier: "free",
        trial: {
          active: false,
          daysRemaining: 0,
          endsAt: "2026-02-15T00:00:00Z",
        },
      }),
    );

    const { result } = renderHook(() => useTrial());

    expect(result.current.isTrialExpired).toBe(true);
    expect(result.current.showCountdown).toBe(false);
    expect(result.current.isTrialActive).toBe(false);
  });

  it("does not show trial expired when trial ended but user is on paid tier", () => {
    mockFeatures(
      createTenantFeaturesStub({
        tier: "pro",
        trial: {
          active: false,
          daysRemaining: 0,
          endsAt: "2026-02-15T00:00:00Z",
        },
      }),
    );

    const { result } = renderHook(() => useTrial());

    expect(result.current.isTrialExpired).toBe(false);
    expect(result.current.showCountdown).toBe(false);
  });

  it("returns defaults for paid subscriber with no trial", () => {
    mockFeatures(createTenantFeaturesStub({ tier: "pro" }));

    const { result } = renderHook(() => useTrial());

    expect(result.current.isTrialActive).toBe(false);
    expect(result.current.showCountdown).toBe(false);
    expect(result.current.isTrialExpired).toBe(false);
    expect(result.current.daysRemaining).toBeNull();
  });

  it("returns loading state when data is undefined", () => {
    mockFeatures(undefined, true);

    const { result } = renderHook(() => useTrial());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isTrialActive).toBe(false);
    expect(result.current.showCountdown).toBe(false);
    expect(result.current.isTrialExpired).toBe(false);
    expect(result.current.daysRemaining).toBeNull();
  });

  it("does not show trial expired when trial was never started (null trial, free tier)", () => {
    mockFeatures(createTenantFeaturesStub({ tier: "free" }));

    const { result } = renderHook(() => useTrial());

    expect(result.current.isTrialExpired).toBe(false);
    expect(result.current.isTrialActive).toBe(false);
    expect(result.current.showCountdown).toBe(false);
  });
});
