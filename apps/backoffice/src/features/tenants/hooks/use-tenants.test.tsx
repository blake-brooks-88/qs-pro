import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useEidLookup, useTenants } from "./use-tenants";

const mocks = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: mocks.getMock,
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("tenant hooks", () => {
  it("fetches tenants with params", async () => {
    mocks.getMock.mockResolvedValueOnce({
      data: { data: [], page: 1, limit: 25, total: 0 },
    });

    const { result } = renderHook(
      () => useTenants({ page: 1, limit: 25, search: "acme" }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getMock).toHaveBeenCalledWith("/tenants", {
      params: expect.objectContaining({ search: "acme" }),
    });
  });

  it("does not fetch EID lookup until refetch is called", async () => {
    mocks.getMock.mockResolvedValueOnce({
      data: {
        eid: "test---eid",
        companyName: "Acme",
        userCount: 1,
        tier: "pro",
        subscriptionStatus: "active",
        signupDate: null,
      },
    });

    const { result } = renderHook(() => useEidLookup("test---eid"), {
      wrapper: createWrapper(),
    });

    await result.current.refetch();
    expect(mocks.getMock).toHaveBeenCalledWith("/tenants/lookup/test---eid");
  });
});
