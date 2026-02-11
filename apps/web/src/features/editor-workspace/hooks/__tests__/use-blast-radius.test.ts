import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { blastRadiusKeys, useBlastRadius } from "../use-blast-radius";

const mockBlastRadiusResponse = {
  automations: [
    {
      id: "auto-1",
      name: "Daily Send",
      status: "Scheduled",
      isHighRisk: true,
    },
    {
      id: "auto-2",
      name: "Test Automation",
      status: "Stopped",
      isHighRisk: false,
    },
  ],
  totalCount: 2,
};

describe("useBlastRadius", () => {
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

  describe("blastRadiusKeys", () => {
    it("produces correct query key", () => {
      expect(blastRadiusKeys.query("sq-123")).toEqual([
        "blastRadius",
        "sq-123",
      ]);
    });
  });

  it("auto-fetches when savedQueryId is provided", async () => {
    let fetchCount = 0;

    server.use(
      http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
        fetchCount++;
        return HttpResponse.json(mockBlastRadiusResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useBlastRadius("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchCount).toBe(1);
  });

  it("does NOT fetch when savedQueryId is undefined", async () => {
    let fetchCount = 0;

    server.use(
      http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
        fetchCount++;
        return HttpResponse.json(mockBlastRadiusResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useBlastRadius(undefined), {
      wrapper: createWrapper(queryClient),
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.isFetching).toBe(false);
    expect(fetchCount).toBe(0);
  });

  it("returns BlastRadiusResponse with automations list", async () => {
    server.use(
      http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
        return HttpResponse.json(mockBlastRadiusResponse);
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useBlastRadius("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.automations).toHaveLength(2);
    expect(result.current.data?.automations[0]?.name).toBe("Daily Send");
    expect(result.current.data?.automations[0]?.isHighRisk).toBe(true);
    expect(result.current.data?.automations[1]?.name).toBe("Test Automation");
    expect(result.current.data?.totalCount).toBe(2);
  });

  it("returns empty automations list when no automations exist", async () => {
    server.use(
      http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
        return HttpResponse.json({ automations: [], totalCount: 0 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useBlastRadius("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.automations).toHaveLength(0);
    expect(result.current.data?.totalCount).toBe(0);
  });

  it("sets error state on fetch failure", async () => {
    server.use(
      http.get("/api/query-activities/blast-radius/:savedQueryId", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const queryClient = createQueryClient();
    const { result } = renderHook(() => useBlastRadius("sq-123"), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
