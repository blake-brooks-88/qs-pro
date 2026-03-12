import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  useCreateInvoicedSubscription,
  useEidLookup,
  useInvoices,
} from "./use-invoicing";

const mocks = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: mocks.getMock,
    post: mocks.postMock,
  },
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("invoicing hooks", () => {
  it("fetches all invoices when no tenantId provided", async () => {
    mocks.getMock.mockResolvedValueOnce({
      data: { invoices: [], hasMore: false, nextCursor: null },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useInvoices(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getMock).toHaveBeenCalledWith("/invoicing/invoices");
  });

  it("fetches tenant invoices when tenantId provided", async () => {
    mocks.getMock.mockResolvedValueOnce({
      data: { invoices: [], hasMore: false, nextCursor: null },
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useInvoices({ tenantId: "t1" }), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getMock).toHaveBeenCalledWith(
      "/invoicing/tenants/t1/invoices",
    );
  });

  it("creates invoiced subscription and invalidates invoices", async () => {
    mocks.postMock.mockResolvedValueOnce({ data: { subscriptionId: "sub_1" } });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateInvoicedSubscription(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      tenantEid: "test---eid",
      tier: "pro",
      interval: "monthly",
      seatCount: 1,
      paymentTerms: "net_30",
      customerEmail: "billing@example.com",
      customerName: "Billing",
      companyName: "Acme",
    });

    expect(mocks.postMock).toHaveBeenCalledWith(
      "/invoicing/subscriptions",
      expect.objectContaining({ tenantEid: "test---eid" }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["invoices"] });
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

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { result } = renderHook(() => useEidLookup("test---eid"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.refetch();
    expect(mocks.getMock).toHaveBeenCalledWith("/tenants/lookup/test---eid");
  });
});
