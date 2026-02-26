import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { usePortalSession } from "@/hooks/use-portal-session";

vi.mock("@/services/billing", () => ({
  createPortalSession: vi.fn(),
}));

import { createPortalSession } from "@/services/billing";

const mockCreatePortalSession = vi.mocked(createPortalSession);

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

describe("usePortalSession", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "open").mockImplementation(() => null);
  });

  it("calls createPortalSession", async () => {
    const url = "https://billing.stripe.com/portal-123";
    mockCreatePortalSession.mockResolvedValueOnce({ url });

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePortalSession(), { wrapper });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockCreatePortalSession).toHaveBeenCalledOnce();
  });

  it("opens URL in new window on success", async () => {
    const url = "https://billing.stripe.com/portal-456";
    mockCreatePortalSession.mockResolvedValueOnce({ url });

    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePortalSession(), { wrapper });

    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(window.open).toHaveBeenCalledWith(url, "_blank");
  });
});
