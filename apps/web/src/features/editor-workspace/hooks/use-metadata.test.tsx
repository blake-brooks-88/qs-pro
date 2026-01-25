import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { defaultFeatures } from "@/test/mocks/handlers";
import { server } from "@/test/mocks/server";

import {
  useDataExtensionFields,
  useDataExtensions,
  useMetadata,
  useMetadataFolders,
} from "./use-metadata";

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

describe("use-metadata hooks", () => {
  beforeEach(() => {
    server.use(
      http.get("/api/features", () => {
        return HttpResponse.json({
          ...defaultFeatures,
          systemDataViews: false,
        });
      }),
    );
  });

  it("useMetadataFolders_mapsFolderData", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    let capturedEid: string | null = null;
    server.use(
      http.get("/api/metadata/folders", ({ request }) => {
        capturedEid = new URL(request.url).searchParams.get("eid");
        return HttpResponse.json([
          { ID: 10, Name: "Root", ParentFolder: null },
          { ID: 11, Name: "Child", ParentFolder: { ID: 10 } },
        ]);
      }),
    );

    const { result } = renderHook(
      () => useMetadataFolders("tenant-1", "eid-1"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(capturedEid).toBe("eid-1");
    expect(result.current.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "10", name: "Root", parentId: null }),
        expect.objectContaining({ id: "11", name: "Child", parentId: "10" }),
      ]),
    );
  });

  it("useDataExtensions_mapsDataExtensions", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    let capturedEid: string | null = null;
    server.use(
      http.get("/api/metadata/data-extensions", ({ request }) => {
        capturedEid = new URL(request.url).searchParams.get("eid");
        return HttpResponse.json([
          { CustomerKey: "DE_Alpha", Name: "Alpha", CategoryID: 200 },
        ]);
      }),
    );

    const { result } = renderHook(
      () => useDataExtensions({ tenantId: "tenant-1", eid: "eid-1" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(capturedEid).toBe("eid-1");
    expect(result.current.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "DE_Alpha",
          name: "Alpha",
          customerKey: "DE_Alpha",
          folderId: "200",
        }),
      ]),
    );
  });

  it("useDataExtensionFields_reusesCache", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    let requestCount = 0;
    server.use(
      http.get("/api/metadata/fields", () => {
        requestCount += 1;
        return HttpResponse.json([
          { Name: "EmailAddress", FieldType: "Text", IsRequired: true },
          { Name: "CreatedDate", FieldType: "Date", IsRequired: false },
        ]);
      }),
    );

    const { result } = renderHook(
      () =>
        useDataExtensionFields({
          tenantId: "tenant-1",
          customerKey: "DE_Alpha",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const { result: cachedResult } = renderHook(
      () =>
        useDataExtensionFields({
          tenantId: "tenant-1",
          customerKey: "DE_Alpha",
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(cachedResult.current.isSuccess).toBe(true);
    });

    expect(requestCount).toBe(1);
  });

  it("useMetadata_prefetchesDataExtensions_afterFoldersLoad", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);

    server.use(
      http.get("/api/metadata/folders", () => {
        return HttpResponse.json([
          { ID: 10, Name: "Root", ParentFolder: null },
        ]);
      }),
      http.get("/api/metadata/data-extensions", () => {
        return HttpResponse.json([
          { CustomerKey: "DE_Alpha", Name: "Alpha", CategoryID: 200 },
        ]);
      }),
    );

    const { result } = renderHook(
      () => useMetadata({ tenantId: "tenant-1", eid: "eid-1" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.folders).toHaveLength(1);
    });

    await waitFor(() => {
      expect(result.current.dataExtensions).toHaveLength(1);
    });

    expect(result.current.error).toBeNull();
  });
});
