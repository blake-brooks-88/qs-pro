import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { publishEventsKeys, usePublishEvents } from "../use-publish-events";

const mockPublishEventsResponse = {
  events: [
    {
      id: "pe-1",
      versionId: "ver-2",
      savedQueryId: "sq-123",
      createdAt: "2026-02-10T12:00:00.000Z",
    },
    {
      id: "pe-2",
      versionId: "ver-1",
      savedQueryId: "sq-123",
      createdAt: "2026-02-08T12:00:00.000Z",
    },
  ],
  total: 2,
};

describe("usePublishEvents", () => {
  const createQueryClient = () => {
    return new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  };

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

  describe("publishEventsKeys", () => {
    it("produces correct all key", () => {
      expect(publishEventsKeys.all).toEqual(["publishEvents"]);
    });

    it("produces correct list key for a savedQueryId", () => {
      expect(publishEventsKeys.list("sq-123")).toEqual([
        "publishEvents",
        "list",
        "sq-123",
      ]);
    });
  });

  it("is disabled when savedQueryId is undefined", async () => {
    let fetchCount = 0;

    server.use(
      http.get("/api/saved-queries/:id/versions/publish-events", () => {
        fetchCount++;
        return HttpResponse.json(mockPublishEventsResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishEvents(undefined), {
      wrapper: createWrapper(queryClient),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.isFetching).toBe(false);
    expect(fetchCount).toBe(0);
  });

  it("fetches data when savedQueryId is provided", async () => {
    let fetchCount = 0;

    server.use(
      http.get("/api/saved-queries/:id/versions/publish-events", () => {
        fetchCount++;
        return HttpResponse.json(mockPublishEventsResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishEvents("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchCount).toBe(1);
  });

  it("returns events from API response", async () => {
    server.use(
      http.get("/api/saved-queries/:id/versions/publish-events", () => {
        return HttpResponse.json(mockPublishEventsResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishEvents("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.events).toHaveLength(2);
    expect(result.current.data?.events[0]?.versionId).toBe("ver-2");
    expect(result.current.data?.total).toBe(2);
  });

  it("returns empty events when no publish events exist", async () => {
    server.use(
      http.get("/api/saved-queries/:id/versions/publish-events", () => {
        return HttpResponse.json({ events: [], total: 0 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishEvents("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.events).toHaveLength(0);
    expect(result.current.data?.total).toBe(0);
  });

  it("sets error state on fetch failure", async () => {
    server.use(
      http.get("/api/saved-queries/:id/versions/publish-events", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishEvents("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("queryFn guard throws when savedQueryId is undefined", async () => {
    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishEvents(undefined), {
      wrapper: createWrapper(queryClient),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    const refetchResult = await result.current.refetch();

    expect(refetchResult.isError).toBe(true);
    expect(refetchResult.error?.message).toBe("savedQueryId is required");
  });
});
