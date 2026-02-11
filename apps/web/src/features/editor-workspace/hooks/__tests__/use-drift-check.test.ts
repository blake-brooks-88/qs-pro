import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { driftCheckKeys, useDriftCheck } from "../use-drift-check";

const mockDriftResponse = {
  hasDrift: true,
  localSql: "SELECT Id FROM [DE_Local]",
  remoteSql: "SELECT Name FROM [DE_Remote]",
  localHash: "hash-local",
  remoteHash: "hash-remote",
};

const mockNoDriftResponse = {
  hasDrift: false,
  localSql: "SELECT 1 FROM [DE]",
  remoteSql: "SELECT 1 FROM [DE]",
  localHash: "same-hash",
  remoteHash: "same-hash",
};

describe("useDriftCheck", () => {
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

  describe("driftCheckKeys", () => {
    it("produces correct check key", () => {
      expect(driftCheckKeys.check("sq-123")).toEqual(["driftCheck", "sq-123"]);
    });
  });

  it("does NOT auto-fetch (enabled: false)", async () => {
    let fetchCount = 0;

    server.use(
      http.get("/api/query-activities/drift/:savedQueryId", () => {
        fetchCount++;
        return HttpResponse.json(mockNoDriftResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDriftCheck("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.isFetching).toBe(false);
    expect(fetchCount).toBe(0);
  });

  it("fetches GET /api/query-activities/drift/:savedQueryId when refetch() is called", async () => {
    let capturedUrl = "";

    server.use(
      http.get("/api/query-activities/drift/:savedQueryId", ({ params }) => {
        capturedUrl = `/api/query-activities/drift/${params.savedQueryId as string}`;
        return HttpResponse.json(mockDriftResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDriftCheck("sq-456"), {
      wrapper: createWrapper(queryClient),
    });

    const refetchResult = await result.current.refetch();

    expect(refetchResult.data?.hasDrift).toBe(true);
    expect(capturedUrl).toBe("/api/query-activities/drift/sq-456");
  });

  it("returns DriftCheckResponse with hasDrift: true when SQL differs", async () => {
    server.use(
      http.get("/api/query-activities/drift/:savedQueryId", () => {
        return HttpResponse.json(mockDriftResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDriftCheck("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    const refetchResult = await result.current.refetch();

    expect(refetchResult.data?.hasDrift).toBe(true);
    expect(refetchResult.data?.localSql).toBe("SELECT Id FROM [DE_Local]");
    expect(refetchResult.data?.remoteSql).toBe("SELECT Name FROM [DE_Remote]");
  });

  it("returns DriftCheckResponse with hasDrift: false when SQL matches", async () => {
    server.use(
      http.get("/api/query-activities/drift/:savedQueryId", () => {
        return HttpResponse.json(mockNoDriftResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDriftCheck("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    const refetchResult = await result.current.refetch();

    expect(refetchResult.data?.hasDrift).toBe(false);
    expect(refetchResult.data?.localSql).toBe("SELECT 1 FROM [DE]");
    expect(refetchResult.data?.remoteSql).toBe("SELECT 1 FROM [DE]");
  });

  it("refetch always makes a new request (staleTime: 0)", async () => {
    let fetchCount = 0;

    server.use(
      http.get("/api/query-activities/drift/:savedQueryId", () => {
        fetchCount++;
        return HttpResponse.json(mockNoDriftResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDriftCheck("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.refetch();
    await result.current.refetch();

    await waitFor(() => expect(fetchCount).toBe(2));
  });

  it("returns error in refetch result on failure", async () => {
    server.use(
      http.get("/api/query-activities/drift/:savedQueryId", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useDriftCheck("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    const refetchResult = await result.current.refetch();

    expect(refetchResult.isError).toBe(true);
    expect(refetchResult.error).toBeTruthy();
  });
});
