import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useCancelSubscription,
  useChangeTier,
  useFeatureOverrides,
  useRemoveFeatureOverride,
  useSetFeatureOverride,
  useTenantDetail,
} from "./use-tenant-detail";

const mocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  patchMock: vi.fn(),
  postMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: mocks.getMock,
    put: mocks.putMock,
    patch: mocks.patchMock,
    post: mocks.postMock,
    delete: mocks.deleteMock,
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("tenant detail hooks", () => {
  it("fetches tenant detail when tenantId is provided", async () => {
    mocks.getMock.mockResolvedValueOnce({ data: { tenantId: "t1" } });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useTenantDetail("t1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getMock).toHaveBeenCalledWith("/tenants/t1");
  });

  it("fetches feature overrides for tenant", async () => {
    mocks.getMock.mockResolvedValueOnce({ data: [] });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useFeatureOverrides("t1"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getMock).toHaveBeenCalledWith("/tenants/t1/feature-overrides");
  });

  it("invalidates tenant detail after setting a feature override", async () => {
    mocks.putMock.mockResolvedValueOnce({});
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useSetFeatureOverride(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      tenantId: "t1",
      featureKey: "advancedAutocomplete",
      enabled: true,
    });

    expect(mocks.putMock).toHaveBeenCalledWith(
      "/tenants/t1/feature-overrides/advancedAutocomplete",
      { enabled: true },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tenants", "t1"] });
  });

  it("invalidates tenant detail after removing a feature override", async () => {
    mocks.deleteMock.mockResolvedValueOnce({});
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveFeatureOverride(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      tenantId: "t1",
      featureKey: "advancedAutocomplete",
    });

    expect(mocks.deleteMock).toHaveBeenCalledWith(
      "/tenants/t1/feature-overrides/advancedAutocomplete",
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tenants", "t1"] });
  });

  it("invalidates tenant detail after tier changes and cancellations", async () => {
    mocks.patchMock.mockResolvedValueOnce({});
    mocks.postMock.mockResolvedValueOnce({});

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const changeTier = renderHook(() => useChangeTier(), {
      wrapper: createWrapper(queryClient),
    });
    await changeTier.result.current.mutateAsync({
      tenantId: "t1",
      tier: "pro",
      interval: "monthly",
    });
    expect(mocks.patchMock).toHaveBeenCalledWith("/tenants/t1/tier", {
      tier: "pro",
      interval: "monthly",
    });

    const cancel = renderHook(() => useCancelSubscription(), {
      wrapper: createWrapper(queryClient),
    });
    await cancel.result.current.mutateAsync({ tenantId: "t1" });
    expect(mocks.postMock).toHaveBeenCalledWith("/tenants/t1/cancel");

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["tenants", "t1"] });
  });
});
