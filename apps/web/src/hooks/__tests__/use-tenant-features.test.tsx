import type { TenantFeatures, TenantFeaturesResponse } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  featuresQueryKeys,
  useTenantFeatures,
} from "@/hooks/use-tenant-features";
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

const mockFeatures: TenantFeatures = {
  basicLinting: true,
  syntaxHighlighting: true,
  quickFixes: false,
  minimap: false,
  advancedAutocomplete: false,
  teamSnippets: false,
  auditLogs: false,
  createDataExtension: false,
  deployToAutomation: false,
  systemDataViews: true,
  runToTargetDE: false,
};

const mockFeaturesResponse: TenantFeaturesResponse = {
  tier: "free",
  features: mockFeatures,
};

describe("useTenantFeatures", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("fetches features on mount", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result } = renderHook(() => useTenantFeatures("tenant-1"), {
      wrapper,
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.data).toEqual(mockFeaturesResponse);
  });

  it("returns loading state initially", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", async () => {
        await new Promise(() => {});
      }),
    );

    const { result } = renderHook(() => useTenantFeatures(), { wrapper });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("returns error state on API failure", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useTenantFeatures(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBeDefined();
  });

  it("does not retry on failure (retry: false)", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    let fetchCount = 0;

    server.use(
      http.get("/api/features", () => {
        fetchCount++;
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useTenantFeatures(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(fetchCount).toBe(1);
  });

  it("caches data for 5 minutes (staleTime)", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    let fetchCount = 0;

    server.use(
      http.get("/api/features", () => {
        fetchCount++;
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result } = renderHook(() => useTenantFeatures(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const { unmount } = renderHook(() => useTenantFeatures(), { wrapper });
    unmount();

    renderHook(() => useTenantFeatures(), { wrapper });

    expect(fetchCount).toBe(1);
  });

  it("generates unique query keys per tenant", () => {
    expect(featuresQueryKeys.all).toEqual(["features"]);
    expect(featuresQueryKeys.tenant("tenant-1")).toEqual([
      "features",
      "tenant",
      "tenant-1",
    ]);
    expect(featuresQueryKeys.tenant("tenant-2")).toEqual([
      "features",
      "tenant",
      "tenant-2",
    ]);
    expect(featuresQueryKeys.tenant(null)).toEqual([
      "features",
      "tenant",
      "unknown",
    ]);
    expect(featuresQueryKeys.tenant(undefined)).toEqual([
      "features",
      "tenant",
      "unknown",
    ]);
  });

  it("fetches fresh data for different tenant IDs", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    let fetchCount = 0;

    server.use(
      http.get("/api/features", () => {
        fetchCount++;
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result: result1 } = renderHook(
      () => useTenantFeatures("tenant-1"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result1.current.isSuccess).toBe(true);
    });

    const { result: result2 } = renderHook(
      () => useTenantFeatures("tenant-2"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result2.current.isSuccess).toBe(true);
    });

    expect(fetchCount).toBe(2);
  });

  it("returns complete feature set from API", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result } = renderHook(() => useTenantFeatures(), { wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const data = result.current.data;
    expect(data).toHaveProperty("tier");
    expect(data).toHaveProperty("features");
    expect(data?.features).toHaveProperty("basicLinting");
    expect(data?.features).toHaveProperty("syntaxHighlighting");
    expect(data?.features).toHaveProperty("quickFixes");
    expect(data?.features).toHaveProperty("minimap");
    expect(data?.features).toHaveProperty("advancedAutocomplete");
    expect(data?.features).toHaveProperty("teamSnippets");
    expect(data?.features).toHaveProperty("auditLogs");
    expect(data?.features).toHaveProperty("createDataExtension");
    expect(data?.features).toHaveProperty("deployToAutomation");
    expect(data?.features).toHaveProperty("systemDataViews");
    expect(data?.features).toHaveProperty("runToTargetDE");
  });
});
