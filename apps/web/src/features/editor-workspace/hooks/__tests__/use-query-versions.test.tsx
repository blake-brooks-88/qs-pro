import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/mocks/server";

import {
  useQueryVersions,
  useRestoreVersion,
  useUpdateVersionName,
  useVersionDetail,
  versionHistoryKeys,
} from "../use-query-versions";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "TestQueryClientWrapper";
  return Wrapper;
}

beforeEach(() => {
  server.use(
    http.post("/api/saved-queries/:id/versions/:versionId/restore", () => {
      return HttpResponse.json({ success: true });
    }),
    http.patch("/api/saved-queries/:id/versions/:versionId", () => {
      return HttpResponse.json({ success: true });
    }),
  );
});

describe("useQueryVersions", () => {
  it("fetches version list when savedQueryId provided", async () => {
    const { result } = renderHook(() => useQueryVersions("sq-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ versions: [], total: 0 });
  });

  it("query disabled when savedQueryId undefined", () => {
    const { result } = renderHook(() => useQueryVersions(undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isLoading).toBe(false);
  });
});

describe("useVersionDetail", () => {
  it("fetches when both IDs provided", async () => {
    const { result } = renderHook(() => useVersionDetail("sq-1", "ver-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      id: "ver-1",
      savedQueryId: "sq-1",
      sqlText: "SELECT 1",
    });
  });

  it("disabled when versionId undefined", () => {
    const { result } = renderHook(() => useVersionDetail("sq-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useRestoreVersion", () => {
  it("calls endpoint, invalidates queries on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useRestoreVersion(), { wrapper });

    await result.current.mutateAsync({
      savedQueryId: "sq-1",
      versionId: "ver-1",
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: versionHistoryKeys.list("sq-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["saved-queries"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["saved-query", "sq-1"],
    });
  });
});

describe("useUpdateVersionName", () => {
  it("calls patch, invalidates list on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useUpdateVersionName(), { wrapper });

    await result.current.mutateAsync({
      savedQueryId: "sq-1",
      versionId: "ver-1",
      data: { versionName: "My Version" },
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: versionHistoryKeys.list("sq-1"),
    });
  });
});
