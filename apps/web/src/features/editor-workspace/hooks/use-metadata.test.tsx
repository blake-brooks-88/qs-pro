import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as metadataService from "@/services/metadata";
import {
  useDataExtensionFields,
  useDataExtensions,
  useMetadataFolders,
  useMetadata,
} from "@/features/editor-workspace/hooks/use-metadata";

vi.mock("@/services/metadata", () => ({
  getFolders: vi.fn(),
  getDataExtensions: vi.fn(),
  getFields: vi.fn(),
}));

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
    vi.restoreAllMocks();
  });

  it("useMetadataFolders_mapsFolderData", async () => {
    // Arrange
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const getFoldersMock = vi.mocked(metadataService.getFolders);
    getFoldersMock.mockResolvedValueOnce([
      { ID: 10, Name: "Root", ParentFolder: null },
      { ID: 11, Name: "Child", ParentFolder: { ID: 10 } },
    ]);

    // Act
    const { result } = renderHook(
      () => useMetadataFolders("tenant-1", "eid-1"),
      {
        wrapper,
      },
    );

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(getFoldersMock).toHaveBeenCalledWith("eid-1");
    expect(result.current.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "10", name: "Root", parentId: null }),
        expect.objectContaining({ id: "11", name: "Child", parentId: "10" }),
      ]),
    );
  });

  it("useDataExtensions_mapsDataExtensions", async () => {
    // Arrange
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const getDataExtensionsMock = vi.mocked(metadataService.getDataExtensions);
    getDataExtensionsMock.mockResolvedValueOnce([
      { CustomerKey: "DE_Alpha", Name: "Alpha", CategoryID: 200 },
    ]);

    // Act
    const { result } = renderHook(
      () => useDataExtensions({ tenantId: "tenant-1", eid: "123" }),
      { wrapper },
    );

    // Assert
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(getDataExtensionsMock).toHaveBeenCalledWith("123");
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
    // Arrange
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const getFieldsMock = vi.mocked(metadataService.getFields);
    getFieldsMock.mockResolvedValueOnce([
      { Name: "EmailAddress", FieldType: "Text", IsRequired: true },
      { Name: "CreatedDate", FieldType: "Date", IsRequired: false },
    ]);

    // Act
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

    // Assert
    await waitFor(() => {
      expect(cachedResult.current.isSuccess).toBe(true);
    });
    expect(getFieldsMock).toHaveBeenCalledTimes(1);
  });

  it("useMetadata_prefetchesDataExtensions_afterFoldersLoad", async () => {
    const queryClient = createQueryClient();
    const wrapper = createWrapper(queryClient);
    const getFoldersMock = vi.mocked(metadataService.getFolders);
    const getDataExtensionsMock = vi.mocked(metadataService.getDataExtensions);

    getFoldersMock.mockResolvedValueOnce([
      { ID: 10, Name: "Root", ParentFolder: null },
    ]);
    getDataExtensionsMock.mockResolvedValueOnce([
      { CustomerKey: "DE_Alpha", Name: "Alpha", CategoryID: 200 },
    ]);

    const { result } = renderHook(
      () => useMetadata({ tenantId: "tenant-1", eid: "eid-1" }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.folders.length).toBe(1);
    });

    await waitFor(() => {
      expect(result.current.dataExtensions.length).toBe(1);
    });

    expect(getDataExtensionsMock).toHaveBeenCalledWith("eid-1");
    expect(result.current.error).toBeNull();
  });
});
