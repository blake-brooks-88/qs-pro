import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import { useLinkQuery, useUnlinkQuery } from "../use-link-query";

const mockLinkResponse = {
  linkedQaObjectId: "qa-obj-1",
  linkedQaCustomerKey: "qa-key-1",
  linkedQaName: "Linked QA",
  linkedAt: "2026-01-15T00:00:00.000Z",
  sqlUpdated: false,
};

describe("use-link-query hooks", () => {
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

  describe("useLinkQuery", () => {
    it("sends POST to correct endpoint", async () => {
      let capturedUrl = "";
      let capturedBody: unknown = null;

      server.use(
        http.post(
          "/api/query-activities/link/:savedQueryId",
          async ({ params, request }) => {
            capturedUrl = `/api/query-activities/link/${params.savedQueryId as string}`;
            capturedBody = await request.json();
            return HttpResponse.json(mockLinkResponse);
          },
        ),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useLinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        savedQueryId: "sq-123",
        qaCustomerKey: "qa-key-1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(capturedUrl).toBe("/api/query-activities/link/sq-123");
      expect(capturedBody).toEqual({
        qaCustomerKey: "qa-key-1",
      });
    });

    it("sends conflictResolution in body when provided", async () => {
      let capturedBody: unknown = null;

      server.use(
        http.post(
          "/api/query-activities/link/:savedQueryId",
          async ({ request }) => {
            capturedBody = await request.json();
            return HttpResponse.json({
              ...mockLinkResponse,
              sqlUpdated: true,
            });
          },
        ),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useLinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        savedQueryId: "sq-123",
        qaCustomerKey: "qa-key-1",
        conflictResolution: "keep-remote",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(capturedBody).toEqual({
        qaCustomerKey: "qa-key-1",
        conflictResolution: "keep-remote",
      });
      expect(result.current.data?.sqlUpdated).toBe(true);
    });

    it("returns link response data on success", async () => {
      server.use(
        http.post("/api/query-activities/link/:savedQueryId", () => {
          return HttpResponse.json(mockLinkResponse);
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useLinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        savedQueryId: "sq-123",
        qaCustomerKey: "qa-key-1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toEqual(mockLinkResponse);
    });

    it("invalidates saved-queries and query-activities caches on success", async () => {
      server.use(
        http.post("/api/query-activities/link/:savedQueryId", () => {
          return HttpResponse.json(mockLinkResponse);
        }),
      );

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useLinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        savedQueryId: "sq-123",
        qaCustomerKey: "qa-key-1",
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["saved-queries"] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["query-activities"] }),
      );
    });

    it("sets error state on failure", async () => {
      server.use(
        http.post("/api/query-activities/link/:savedQueryId", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useLinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({
        savedQueryId: "sq-123",
        qaCustomerKey: "qa-key-1",
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });

  describe("useUnlinkQuery", () => {
    it("sends DELETE to correct endpoint", async () => {
      let capturedUrl = "";

      server.use(
        http.delete(
          "/api/query-activities/link/:savedQueryId",
          ({ params }) => {
            capturedUrl = `/api/query-activities/link/${params.savedQueryId as string}`;
            return HttpResponse.json({ success: true });
          },
        ),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useUnlinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({ savedQueryId: "sq-456" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(capturedUrl).toBe("/api/query-activities/link/sq-456");
    });

    it("invalidates saved-queries and query-activities caches on success", async () => {
      server.use(
        http.delete("/api/query-activities/link/:savedQueryId", () => {
          return HttpResponse.json({ success: true });
        }),
      );

      const queryClient = createQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderHook(() => useUnlinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({ savedQueryId: "sq-456" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["saved-queries"] }),
      );
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["query-activities"] }),
      );
    });

    it("sets error state on failure", async () => {
      server.use(
        http.delete("/api/query-activities/link/:savedQueryId", () => {
          return new HttpResponse(null, { status: 500 });
        }),
      );

      const queryClient = createQueryClient();
      const { result } = renderHook(() => useUnlinkQuery(), {
        wrapper: createWrapper(queryClient),
      });

      result.current.mutate({ savedQueryId: "sq-456" });

      await waitFor(() => expect(result.current.isError).toBe(true));
    });
  });
});
