import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { useFeature } from "@/hooks/use-feature";
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

const mockFeaturesResponse = {
  tier: "free" as const,
  features: {
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
  },
};

describe("useFeature", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("returns enabled: true for enabled feature", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("returns enabled: false for disabled feature", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result } = renderHook(() => useFeature("quickFixes"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("returns isLoading: true and enabled: false while loading (fail-closed)", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", async () => {
        await new Promise(() => {});
      }),
    );

    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it("returns enabled: false when API returns error", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("returns enabled: false for feature missing from response (fail-closed)", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json({
          tier: "free",
          features: {
            basicLinting: true,
            syntaxHighlighting: true,
          },
        });
      }),
    );

    const { result } = renderHook(() => useFeature("quickFixes"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(false);
      expect(result.current.isLoading).toBe(false);
    });
  });

  it("caches feature data across multiple hook instances", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    let fetchCount = 0;

    server.use(
      http.get("/api/features", () => {
        fetchCount++;
        return HttpResponse.json(mockFeaturesResponse);
      }),
    );

    const { result: result1 } = renderHook(() => useFeature("basicLinting"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result1.current.enabled).toBe(true);
    });

    const { result: result2 } = renderHook(() => useFeature("quickFixes"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result2.current.enabled).toBe(false);
    });

    expect(fetchCount).toBe(1);
  });

  it("handles all feature keys correctly", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    const allEnabledFeaturesResponse = {
      tier: "enterprise" as const,
      features: {
        basicLinting: true,
        syntaxHighlighting: true,
        quickFixes: true,
        minimap: true,
        advancedAutocomplete: true,
        teamSnippets: true,
        auditLogs: true,
        createDataExtension: true,
        deployToAutomation: true,
        systemDataViews: true,
        runToTargetDE: true,
      },
    };

    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json(allEnabledFeaturesResponse);
      }),
    );

    const { result } = renderHook(() => useFeature("deployToAutomation"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.enabled).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });
  });
});
