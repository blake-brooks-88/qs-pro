import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metadataQueryKeys } from "@/features/editor-workspace/hooks/use-metadata";
import type { DataExtensionDraft } from "@/features/editor-workspace/types";

import { useCreateDataExtensionFlow } from "../use-create-data-extension-flow";

const {
  mockInferSchemaFromQuery,
  mockCreateMetadataFetcher,
  mockCreateDE,
  mockToastError,
} = vi.hoisted(() => ({
  mockInferSchemaFromQuery: vi.fn(),
  mockCreateMetadataFetcher: vi.fn(),
  mockCreateDE: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/services/metadata", () => ({
  createDataExtension: (...args: unknown[]) => mockCreateDE(...args),
}));

vi.mock("../../utils/schema-inferrer", () => ({
  inferSchemaFromQuery: (...args: unknown[]) =>
    mockInferSchemaFromQuery(...args),
}));

vi.mock("../../utils/metadata-fetcher", () => ({
  createMetadataFetcher: (...args: unknown[]) =>
    mockCreateMetadataFetcher(...args),
}));

describe("useCreateDataExtensionFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens modal and stores inferred fields on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockCreateMetadataFetcher.mockReturnValue({
      getFieldsForTable: vi.fn().mockResolvedValue(null),
    });
    mockInferSchemaFromQuery.mockResolvedValue([
      {
        name: "SubscriberKey",
        type: "Text",
        isPrimaryKey: true,
        isNullable: false,
        length: 254,
      },
    ]);

    const { result } = renderHook(() =>
      useCreateDataExtensionFlow({
        queryClient,
        tenantId: "t1",
        eid: "e1",
        sqlText: "SELECT 1",
      }),
    );

    await act(async () => {
      await result.current.handleCreateDE();
    });

    expect(result.current.isDEModalOpen).toBe(true);
    expect(result.current.inferredFields).toHaveLength(1);
    expect(result.current.inferredFields.at(0)?.name).toBe("SubscriberKey");
  });

  it("strips client-only field ids when saving", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();
    const refetchSpy = vi
      .spyOn(queryClient, "refetchQueries")
      .mockResolvedValue();

    mockCreateDE.mockResolvedValue({});

    const { result } = renderHook(() =>
      useCreateDataExtensionFlow({
        queryClient,
        tenantId: "t1",
        eid: "e1",
        sqlText: "SELECT 1",
      }),
    );

    const draft: DataExtensionDraft = {
      name: "MyDE",
      folderId: "f1",
      isSendable: false,
      fields: [
        {
          id: "client-id",
          name: "Email",
          type: "EmailAddress",
          isPrimaryKey: false,
          isNullable: true,
        },
      ],
    };

    await result.current.handleSaveDataExtension(draft);

    expect(mockCreateDE).toHaveBeenCalledTimes(1);
    const dto = mockCreateDE.mock.calls[0]?.[0] as {
      fields: Array<Record<string, unknown>>;
      name: string;
    };
    expect(dto.name).toBe("MyDE");
    expect(dto.fields).toHaveLength(1);
    expect(dto.fields[0]).not.toHaveProperty("id");

    const queryKey = metadataQueryKeys.dataExtensions("t1", "e1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey, type: "all" });
  });

  it("schema inference failure: toast.error called, modal opens with empty fields", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockCreateMetadataFetcher.mockReturnValue({
      getFieldsForTable: vi.fn().mockResolvedValue(null),
    });
    mockInferSchemaFromQuery.mockRejectedValue(new Error("parse error"));

    const { result } = renderHook(() =>
      useCreateDataExtensionFlow({
        queryClient,
        tenantId: "t1",
        eid: "e1",
        sqlText: "INVALID SQL",
      }),
    );

    await act(async () => {
      await result.current.handleCreateDE();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Could not infer schema from query",
    );
    expect(result.current.isDEModalOpen).toBe(true);
    expect(result.current.inferredFields).toEqual([]);
  });

  it("optional customerKey included in DTO when provided", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    vi.spyOn(queryClient, "refetchQueries").mockResolvedValue();

    mockCreateDE.mockResolvedValue({});

    const { result } = renderHook(() =>
      useCreateDataExtensionFlow({
        queryClient,
        tenantId: "t1",
        eid: "e1",
        sqlText: "SELECT 1",
      }),
    );

    const draft: DataExtensionDraft = {
      name: "MyDE",
      customerKey: "custom-key-123",
      folderId: "f1",
      isSendable: false,
      fields: [
        {
          name: "Email",
          type: "EmailAddress",
          isPrimaryKey: false,
          isNullable: true,
        },
      ],
    };

    await result.current.handleSaveDataExtension(draft);

    expect(mockCreateDE).toHaveBeenCalledTimes(1);
    const dto = mockCreateDE.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(dto.customerKey).toBe("custom-key-123");
  });
});
