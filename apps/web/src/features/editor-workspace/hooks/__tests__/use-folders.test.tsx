import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { server } from "@/test/mocks/server";

import {
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useUpdateFolder,
} from "../use-folders";

function createWrapper(queryClient: QueryClient) {
  function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return TestWrapper;
}

describe("useCreateFolder", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("optimistically inserts a temp folder and replaces it with the server folder on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(["folders"], []);

    let lastRequestBody: unknown = null;
    server.use(
      http.post("/api/folders", async ({ request }) => {
        lastRequestBody = await request.json();
        await new Promise((r) => setTimeout(r, 25));
        return HttpResponse.json({
          id: "f-new",
          name: "New Folder",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    const { result } = renderHook(() => useCreateFolder(), {
      wrapper: createWrapper(queryClient),
    });

    const mutationPromise = result.current.mutateAsync({
      name: "New Folder",
      parentId: null,
    });

    await waitFor(() => {
      const folders = queryClient.getQueryData<{ id: string; name: string }[]>([
        "folders",
      ]);
      expect(folders).toBeDefined();
      expect(folders?.some((f) => f.id.startsWith("temp-"))).toBe(true);
      expect(folders?.some((f) => f.name === "New Folder")).toBe(true);
    });

    await mutationPromise;

    await waitFor(() => {
      const folders = queryClient.getQueryData<
        { id: string; name: string; parentId: string | null }[]
      >(["folders"]);
      expect(folders?.some((f) => f.id === "f-new")).toBe(true);
      expect(folders?.some((f) => f.id.startsWith("temp-"))).toBe(false);
    });

    expect(lastRequestBody).toEqual({ name: "New Folder", parentId: null });
  });

  it("rolls back the optimistic insert when the create request fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ["folders"],
      [
        {
          id: "f-existing",
          name: "Existing",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
      ],
    );

    server.use(
      http.post("/api/folders", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useCreateFolder(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ name: "Will Fail", parentId: null }),
    ).rejects.toBeInstanceOf(Error);

    await waitFor(() => {
      const folders = queryClient.getQueryData<
        { id: string; name: string; parentId: string | null }[]
      >(["folders"]);
      expect(folders).toHaveLength(1);
      expect(folders?.[0]?.id).toBe("f-existing");
      expect(folders?.[0]?.name).toBe("Existing");
    });
  });

  it("removes the folders cache entry on error when there was no prior cached data", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    server.use(
      http.post("/api/folders", () => {
        return new HttpResponse(null, { status: 500 });
      }),
    );

    const { result } = renderHook(() => useCreateFolder(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ name: "Will Fail", parentId: null }),
    ).rejects.toBeInstanceOf(Error);

    await waitFor(() => {
      expect(queryClient.getQueryData(["folders"])).toBeUndefined();
    });
  });
});

describe("useUpdateFolder", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("optimistically updates a folder and keeps the updated value after success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ["folders"],
      [
        {
          id: "f1",
          name: "Old Name",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
      ],
    );

    let patchBody: unknown = null;
    server.use(
      http.patch("/api/folders/:id", async ({ request }) => {
        patchBody = await request.json();
        await new Promise((r) => setTimeout(r, 25));
        return HttpResponse.json({
          id: "f1",
          name: (patchBody as { name: string }).name,
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    const { result } = renderHook(() => useUpdateFolder(), {
      wrapper: createWrapper(queryClient),
    });

    const mutationPromise = result.current.mutateAsync({
      id: "f1",
      data: { name: "New Name" },
    });

    await waitFor(() => {
      const folders = queryClient.getQueryData<{ id: string; name: string }[]>([
        "folders",
      ]);
      expect(folders?.[0]?.name).toBe("New Name");
    });

    await mutationPromise;

    expect(patchBody).toEqual({ name: "New Name" });
  });

  it("rolls back an optimistic update when the update request fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ["folders"],
      [
        {
          id: "f1",
          name: "Old Name",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
      ],
    );

    server.use(
      http.patch(
        "/api/folders/:id",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useUpdateFolder(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(
      result.current.mutateAsync({ id: "f1", data: { name: "New Name" } }),
    ).rejects.toBeInstanceOf(Error);

    await waitFor(() => {
      const folders = queryClient.getQueryData<{ id: string; name: string }[]>([
        "folders",
      ]);
      expect(folders?.[0]?.name).toBe("Old Name");
    });
  });

  it("does not create folders cache data when updating without prior cached folders", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    server.use(
      http.patch("/api/folders/:id", async ({ request, params }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json({
          id: String(params.id),
          name: body.name,
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        });
      }),
    );

    const { result } = renderHook(() => useUpdateFolder(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({ id: "f1", data: { name: "New Name" } });

    await waitFor(() => {
      expect(queryClient.getQueryData(["folders"])).toBeUndefined();
    });
  });
});

describe("useDeleteFolder", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("optimistically removes a folder and keeps it removed after success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ["folders"],
      [
        {
          id: "f1",
          name: "Folder A",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
        {
          id: "f2",
          name: "Folder B",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
      ],
    );

    let deleteCount = 0;
    server.use(
      http.delete("/api/folders/:id", async () => {
        deleteCount += 1;
        await new Promise((r) => setTimeout(r, 25));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: createWrapper(queryClient),
    });

    const mutationPromise = result.current.mutateAsync("f1");

    await waitFor(() => {
      const folders = queryClient.getQueryData<{ id: string }[]>(["folders"]);
      expect(folders?.some((f) => f.id === "f1")).toBe(false);
      expect(folders).toHaveLength(1);
    });

    await mutationPromise;
    expect(deleteCount).toBe(1);
  });

  it("rolls back an optimistic removal when the delete request fails", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(
      ["folders"],
      [
        {
          id: "f1",
          name: "Folder A",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
        {
          id: "f2",
          name: "Folder B",
          parentId: null,
          createdAt: "2026-02-19T00:00:00.000Z",
          updatedAt: "2026-02-19T00:00:00.000Z",
        },
      ],
    );

    server.use(
      http.delete(
        "/api/folders/:id",
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: createWrapper(queryClient),
    });

    await expect(result.current.mutateAsync("f1")).rejects.toBeInstanceOf(
      Error,
    );

    await waitFor(() => {
      const folders = queryClient.getQueryData<{ id: string }[]>(["folders"]);
      expect(folders?.some((f) => f.id === "f1")).toBe(true);
      expect(folders).toHaveLength(2);
    });
  });

  it("does not create folders cache data when deleting without prior cached folders", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    server.use(
      http.delete(
        "/api/folders/:id",
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const { result } = renderHook(() => useDeleteFolder(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync("f1");

    await waitFor(() => {
      expect(queryClient.getQueryData(["folders"])).toBeUndefined();
    });
  });
});

describe("useFolders", () => {
  beforeEach(() => {
    server.resetHandlers();
  });

  it("fetches folders from the API when enabled", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    server.use(
      http.get("/api/folders", () =>
        HttpResponse.json([
          {
            id: "f1",
            name: "Folder A",
            parentId: null,
            createdAt: "2026-02-19T00:00:00.000Z",
            updatedAt: "2026-02-19T00:00:00.000Z",
          },
        ]),
      ),
    );

    const { result } = renderHook(() => useFolders(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.data?.[0]?.id).toBe("f1");
      expect(result.current.data?.[0]?.name).toBe("Folder A");
    });
  });
});
