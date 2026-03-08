import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCheckout } from "@/hooks/use-checkout";
import { hasPendingCheckout } from "@/lib/pending-checkout";

vi.mock("@/services/billing", () => ({
  createCheckout: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

import { createCheckout } from "@/services/billing";

const mockCreateCheckout = vi.mocked(createCheckout);
const mockToastError = vi.mocked(toast.error);

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
    vi.spyOn(window, "open").mockImplementation(
      () => ({ closed: false }) as WindowProxy,
    );
    mockToastError.mockReset();
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

    expect(window.open).toHaveBeenCalledWith(
      url,
      "_blank",
      "noopener,noreferrer",
    );
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
    expect(hasPendingCheckout()).toBe(true);
  });

  it("shows a toast with the API detail when checkout fails", async () => {
    mockCreateCheckout.mockRejectedValueOnce({
      response: {
        status: 404,
        data: {
          detail: "Cannot POST /api/billing/checkout",
        },
      },
      isAxiosError: true,
    });

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "monthly" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockToastError).toHaveBeenCalledWith("Unable to start checkout", {
      description: "Cannot POST /api/billing/checkout",
    });
  });

  it("shows a redeploy hint when the checkout route returns 404 without detail", async () => {
    mockCreateCheckout.mockRejectedValueOnce({
      response: {
        status: 404,
        data: {},
      },
      isAxiosError: true,
    });

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "monthly" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockToastError).toHaveBeenCalledWith("Unable to start checkout", {
      description:
        "The billing checkout route is unavailable. Please try again after the API is redeployed.",
    });
  });

  it("shows a generic support message for non-Axios failures", async () => {
    mockCreateCheckout.mockRejectedValueOnce(new Error("socket hang up"));

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "annual" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(mockToastError).toHaveBeenCalledWith("Unable to start checkout", {
      description: "Please try again or contact support.",
    });
  });

  it("re-syncs features when checkout is already paid server-side", async () => {
    mockCreateCheckout.mockRejectedValueOnce({
      response: {
        status: 400,
        data: {
          detail: "An active paid subscription already exists for this tenant",
        },
      },
      isAxiosError: true,
    });

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => useCheckout(), { wrapper });

    result.current.mutate({ tier: "pro", interval: "monthly" });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["features"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["usage"],
    });
  });
});
