import type { QADetail, QAListItem } from "@qpp/shared-types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import {
  queryActivityKeys,
  useQueryActivitiesList,
  useQueryActivityDetail,
} from "../use-query-activities-list";

const mockQAList: QAListItem[] = [
  {
    objectId: "qa-obj-1",
    customerKey: "qa-key-1",
    name: "QA One",
    targetUpdateType: "Overwrite",
    modifiedDate: "2026-01-15T00:00:00Z",
    isLinked: false,
    linkedToQueryName: null,
  },
  {
    objectId: "qa-obj-2",
    customerKey: "qa-key-2",
    name: "QA Two",
    targetUpdateType: "Append",
    modifiedDate: "2026-01-16T00:00:00Z",
    isLinked: true,
    linkedToQueryName: "Linked Query",
  },
];

const mockQADetail: QADetail = {
  objectId: "qa-obj-1",
  customerKey: "qa-key-1",
  name: "QA One",
  queryText: "SELECT 1 FROM [DE]",
  targetUpdateType: "Overwrite",
  isLinked: false,
  linkedToQueryName: null,
};

describe("use-query-activities-list hooks", () => {
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

  describe("queryActivityKeys", () => {
    it("produces correct all key", () => {
      expect(queryActivityKeys.all).toEqual(["query-activities"]);
    });

    it("produces correct detail key with customerKey", () => {
      expect(queryActivityKeys.detail("qa-key-1")).toEqual([
        "query-activities",
        "qa-key-1",
      ]);
    });
  });

  describe("useQueryActivitiesList", () => {
    it("fetches QA list from GET /api/query-activities", async () => {
      server.use(
        http.get("/api/query-activities", () => {
          return HttpResponse.json(mockQAList);
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useQueryActivitiesList(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data?.[0]?.name).toBe("QA One");
      expect(result.current.data?.[1]?.name).toBe("QA Two");
    });

    it("returns QAListItem shape with link status", async () => {
      server.use(
        http.get("/api/query-activities", () => {
          return HttpResponse.json(mockQAList);
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useQueryActivitiesList(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const linked = result.current.data?.find((qa) => qa.isLinked);
      expect(linked?.linkedToQueryName).toBe("Linked Query");

      const unlinked = result.current.data?.find((qa) => !qa.isLinked);
      expect(unlinked?.linkedToQueryName).toBeNull();
    });

    it("does not fetch when enabled is false", async () => {
      let fetchCount = 0;
      server.use(
        http.get("/api/query-activities", () => {
          fetchCount++;
          return HttpResponse.json(mockQAList);
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(
        () => useQueryActivitiesList({ enabled: false }),
        { wrapper: createWrapper(queryClient) },
      );

      // Give it time to potentially fetch
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.current.isFetching).toBe(false);
      expect(fetchCount).toBe(0);
    });

    it("sets error state on fetch failure", async () => {
      server.use(
        http.get("/api/query-activities", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useQueryActivitiesList(), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useQueryActivityDetail", () => {
    it("fetches detail from GET /api/query-activities/:customerKey", async () => {
      server.use(
        http.get("/api/query-activities/:customerKey", ({ params }) => {
          if (params.customerKey === "qa-key-1") {
            return HttpResponse.json(mockQADetail);
          }
          return new HttpResponse(null, { status: 404 });
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useQueryActivityDetail("qa-key-1"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data?.name).toBe("QA One");
      expect(result.current.data?.queryText).toBe("SELECT 1 FROM [DE]");
    });

    it("does not fetch when customerKey is undefined", async () => {
      let fetchCount = 0;
      server.use(
        http.get("/api/query-activities/:customerKey", () => {
          fetchCount++;
          return HttpResponse.json(mockQADetail);
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useQueryActivityDetail(undefined), {
        wrapper: createWrapper(queryClient),
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(result.current.isFetching).toBe(false);
      expect(fetchCount).toBe(0);
    });

    it("sets error state on fetch failure", async () => {
      server.use(
        http.get("/api/query-activities/:customerKey", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useQueryActivityDetail("qa-key-1"), {
        wrapper: createWrapper(queryClient),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
