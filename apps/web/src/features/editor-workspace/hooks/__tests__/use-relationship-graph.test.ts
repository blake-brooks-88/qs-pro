import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RelationshipGraphResponse } from "@/features/editor-workspace/utils/relationship-graph/types";
import { server } from "@/test/mocks/server";

const mockUseFeature = vi.fn();

vi.mock("@/hooks/use-feature", () => ({
  useFeature: (...args: unknown[]) => mockUseFeature(...args),
}));

import { useRelationshipGraph } from "../use-relationship-graph";

const mockGraphResponse: RelationshipGraphResponse = {
  edges: [
    {
      sourceDE: "Subscribers",
      sourceColumn: "SubscriberKey",
      targetDE: "Orders",
      targetColumn: "SubscriberKey",
      confidence: "confirmed",
      source: "attribute_group",
    },
    {
      sourceDE: "Orders",
      sourceColumn: "ProductId",
      targetDE: "Products",
      targetColumn: "Id",
      confidence: "confirmed",
      source: "user",
    },
  ],
  exclusions: [],
};

describe("useRelationshipGraph", () => {
  const createQueryClient = () =>
    new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

  const createWrapper = (queryClient: QueryClient) => {
    return function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      );
    };
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns empty graph when feature is disabled", () => {
    mockUseFeature.mockReturnValue({ enabled: false, isLoading: false });

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useRelationshipGraph(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.graph).toEqual({ edges: [], exclusions: [] });
    expect(result.current.isLoading).toBe(false);
  });

  it("returns isLoading true while query is pending", () => {
    mockUseFeature.mockReturnValue({ enabled: true, isLoading: false });

    server.use(
      http.get("/api/relationships/graph", () => {
        return new Promise(() => {});
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useRelationshipGraph(), {
      wrapper: createWrapper(queryClient),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it("builds relationship graph from API data when feature is enabled", async () => {
    mockUseFeature.mockReturnValue({ enabled: true, isLoading: false });

    server.use(
      http.get("/api/relationships/graph", () => {
        return HttpResponse.json(mockGraphResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useRelationshipGraph(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.graph.edges.length).toBeGreaterThan(0);
    expect(
      result.current.graph.edges.some(
        (e) =>
          e.sourceDE === "Subscribers" &&
          e.targetDE === "Orders" &&
          e.confidence === "confirmed",
      ),
    ).toBe(true);
  });

  it("does not fetch when feature is disabled", () => {
    mockUseFeature.mockReturnValue({ enabled: false, isLoading: false });

    let fetchCalled = false;
    server.use(
      http.get("/api/relationships/graph", () => {
        fetchCalled = true;
        return HttpResponse.json(mockGraphResponse);
      }),
    );

    const queryClient = createQueryClient();
    renderHook(() => useRelationshipGraph(), {
      wrapper: createWrapper(queryClient),
    });

    expect(fetchCalled).toBe(false);
  });
});
