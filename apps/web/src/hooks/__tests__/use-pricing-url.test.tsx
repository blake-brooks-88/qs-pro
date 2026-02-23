import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { PRICING_PAGE_URL } from "@/config/urls";
import { usePricingUrl } from "@/hooks/use-pricing-url";
import { server } from "@/test/mocks/server";

const createWrapper = (queryClient: QueryClient) => {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

describe("usePricingUrl", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("returns fallback PRICING_PAGE_URL initially before query resolves", () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/billing/pricing-token", async () => {
        await new Promise(() => {});
      }),
    );

    const { result } = renderHook(() => usePricingUrl(), { wrapper });

    expect(result.current).toBe(PRICING_PAGE_URL);
  });

  it("returns built pricing URL with token after successful API call", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const { result } = renderHook(() => usePricingUrl(), { wrapper });

    await waitFor(() => {
      expect(result.current).toBe(
        "https://queryplusplus.com/pricing?eid=test-encrypted-token",
      );
    });
  });

  it("returns fallback PRICING_PAGE_URL when API fails", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    let fetchCount = 0;

    server.use(
      http.get("/api/billing/pricing-token", () => {
        fetchCount++;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => usePricingUrl(), { wrapper });

    await waitFor(() => {
      expect(fetchCount).toBeGreaterThanOrEqual(1);
    });

    expect(result.current).toBe(PRICING_PAGE_URL);
  });

  it("retries once on failure (retry: 1)", async () => {
    const queryClient = new QueryClient();
    const wrapper = createWrapper(queryClient);
    let fetchCount = 0;

    server.use(
      http.get("/api/billing/pricing-token", () => {
        fetchCount++;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => usePricingUrl(), { wrapper });

    await waitFor(
      () => {
        expect(fetchCount).toBe(2);
      },
      { timeout: 5000 },
    );

    expect(result.current).toBe(PRICING_PAGE_URL);
  });
});
