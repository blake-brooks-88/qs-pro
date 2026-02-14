import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { QueryActivityDraft } from "@/features/editor-workspace/types";

import { useQueryActivityDeploymentFlow } from "../use-query-activity-deployment-flow";

const { mockCreateQA, mockLinkQA, mockToastSuccess, mockToastError } =
  vi.hoisted(() => ({
    mockCreateQA: vi.fn(),
    mockLinkQA: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
  }));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    warning: vi.fn(),
  },
}));

vi.mock("../use-create-query-activity", () => ({
  useCreateQueryActivity: () => ({
    mutateAsync: (...args: unknown[]) => mockCreateQA(...args),
    isPending: false,
  }),
}));

vi.mock("../use-link-query", () => ({
  useLinkQuery: () => ({
    mutateAsync: (...args: unknown[]) => mockLinkQA(...args),
  }),
}));

describe("useQueryActivityDeploymentFlow", () => {
  it("opens/closes modal and auto-links on successful deploy", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockResolvedValue();

    const storeUpdateTabLinkState = vi.fn();

    mockCreateQA.mockResolvedValue({ objectId: "obj-1", customerKey: "qa-1" });
    mockLinkQA.mockResolvedValue({
      linkedQaCustomerKey: "qa-1",
      linkedQaName: "My QA",
    });

    const { result } = renderHook(() =>
      useQueryActivityDeploymentFlow({
        queryClient,
        activeTabId: "tab-1",
        activeTab: { queryId: "sq-1", name: "Query", content: "SELECT 1" },
        storeUpdateTabLinkState,
      }),
    );

    act(() => {
      result.current.openQueryActivityModal();
    });
    expect(result.current.isQueryActivityModalOpen).toBe(true);

    const draft: QueryActivityDraft = {
      name: "QA Name",
      description: "desc",
      targetDataExtensionCustomerKey: "de-key",
      targetUpdateType: "Overwrite",
      queryText: "SELECT 1",
    };

    await act(async () => {
      await result.current.handleCreateQueryActivity(draft);
    });

    expect(mockCreateQA).toHaveBeenCalledTimes(1);
    expect(mockLinkQA).toHaveBeenCalledTimes(1);
    expect(storeUpdateTabLinkState).toHaveBeenCalledWith("tab-1", {
      linkedQaCustomerKey: "qa-1",
      linkedQaName: "My QA",
    });
    expect(invalidateSpy).toHaveBeenCalled();
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(result.current.isQueryActivityModalOpen).toBe(false);
  });

  it("keeps modal open and toasts error on deploy failure", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();

    const storeUpdateTabLinkState = vi.fn();

    mockCreateQA.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() =>
      useQueryActivityDeploymentFlow({
        queryClient,
        activeTabId: "tab-1",
        activeTab: { queryId: "sq-1", name: "Query", content: "SELECT 1" },
        storeUpdateTabLinkState,
      }),
    );

    act(() => {
      result.current.openQueryActivityModal();
    });

    await act(async () => {
      await result.current.handleCreateQueryActivity({
        name: "QA Name",
        targetDataExtensionCustomerKey: "de-key",
        targetUpdateType: "Overwrite",
        queryText: "SELECT 1",
      });
    });

    expect(mockToastError).toHaveBeenCalled();
    expect(result.current.isQueryActivityModalOpen).toBe(true);
    expect(storeUpdateTabLinkState).not.toHaveBeenCalled();
  });
});
