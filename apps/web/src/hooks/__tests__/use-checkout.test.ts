import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCheckout } from "@/hooks/use-checkout";

vi.mock("@/services/billing", () => ({
  createCheckout: vi.fn(),
}));

import { createCheckout } from "@/services/billing";

const mockCreateCheckout = vi.mocked(createCheckout);

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("useCheckout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("calls createCheckout with correct tier and interval", async () => {
    const url = "https://checkout.stripe.com/session-123";
    mockCreateCheckout.mockResolvedValueOnce({ url });

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "monthly" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockCreateCheckout).toHaveBeenCalledWith("pro", "monthly");
  });

  it("opens URL in new window on success", async () => {
    const url = "https://checkout.stripe.com/session-456";
    mockCreateCheckout.mockResolvedValueOnce({ url });

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "annual" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(window.open).toHaveBeenCalledWith(url, "_blank");
  });

  it("invalidates features and usage queries on success", async () => {
    const url = "https://checkout.stripe.com/session-789";
    mockCreateCheckout.mockResolvedValueOnce({ url });

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "monthly" });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["features"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["usage"],
    });
  });
});
