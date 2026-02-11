import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { usePublishQuery } from "../use-publish-query";

const mockPublishResponse = {
  publishEventId: "pub-evt-1",
  versionId: "ver-1",
  savedQueryId: "sq-123",
  publishedSqlHash: "abc123",
  publishedAt: "2026-02-10T00:00:00.000Z",
};

describe("usePublishQuery", () => {
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

  it("sends POST to /api/query-activities/publish/:savedQueryId", async () => {
    let capturedUrl = "";
    let capturedBody: unknown = null;

    server.use(
      http.post(
        "/api/query-activities/publish/:savedQueryId",
        async ({ params, request }) => {
          capturedUrl = `/api/query-activities/publish/${params.savedQueryId as string}`;
          capturedBody = await request.json();
          return HttpResponse.json(mockPublishResponse);
        },
      ),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedUrl).toBe("/api/query-activities/publish/sq-123");
    expect(capturedBody).toEqual({ versionId: "ver-1" });
  });

  it("returns publish response data on success", async () => {
    server.use(
      http.post("/api/query-activities/publish/:savedQueryId", () => {
        return HttpResponse.json(mockPublishResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockPublishResponse);
  });

  it("invalidates saved-queries cache on success", async () => {
    server.use(
      http.post("/api/query-activities/publish/:savedQueryId", () => {
        return HttpResponse.json(mockPublishResponse);
      }),
    );

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["saved-queries"] }),
    );
  });

  it("invalidates query-activities cache on success", async () => {
    server.use(
      http.post("/api/query-activities/publish/:savedQueryId", () => {
        return HttpResponse.json(mockPublishResponse);
      }),
    );

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["query-activities"] }),
    );
  });

  it("invalidates version history cache for the specific savedQueryId on success", async () => {
    server.use(
      http.post("/api/query-activities/publish/:savedQueryId", () => {
        return HttpResponse.json(mockPublishResponse);
      }),
    );

    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["versionHistory", "list", "sq-123"],
      }),
    );
  });

  it("sets error state on 403 (feature not enabled)", async () => {
    server.use(
      http.post("/api/query-activities/publish/:savedQueryId", () => {
        return new HttpResponse(null, { status: 403 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("sets error state on 404 (not found)", async () => {
    server.use(
      http.post("/api/query-activities/publish/:savedQueryId", () => {
        return new HttpResponse(null, { status: 404 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => usePublishQuery(), {
      wrapper: createWrapper(queryClient),
    });

    result.current.mutate({
      savedQueryId: "sq-123",
      versionId: "ver-1",
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
