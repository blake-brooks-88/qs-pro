import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockToast } from "@/test/mocks/sonner";
import { createTabStub } from "@/test/stubs";

import { useVersionHistoryFlow } from "../use-version-history-flow";

type FlowOptions = Parameters<typeof useVersionHistoryFlow>[0];

function createDefaultOptions(): FlowOptions & {
  openVersionHistory: ReturnType<typeof vi.fn>;
  closeVersionHistory: ReturnType<typeof vi.fn>;
  storeFindTabByQueryId: ReturnType<typeof vi.fn>;
  storeUpdateTabContent: ReturnType<typeof vi.fn>;
  storeSetActiveTab: ReturnType<typeof vi.fn>;
  storeMarkTabSaved: ReturnType<typeof vi.fn>;
  updateQuery: FlowOptions["updateQuery"] & {
    mutateAsync: ReturnType<typeof vi.fn>;
  };
} {
  const tab = createTabStub();
  return {
    activeTabId: tab.id,
    activeTab: {
      id: tab.id,
      queryId: tab.queryId,
      name: tab.name,
      content: tab.content,
      isDirty: tab.isDirty,
    },
    versionHistorySavedQueryId: null,
    openVersionHistory: vi.fn(),
    closeVersionHistory: vi.fn(),
    storeFindTabByQueryId: vi.fn().mockReturnValue(undefined),
    storeUpdateTabContent: vi.fn(),
    storeSetActiveTab: vi.fn(),
    storeMarkTabSaved: vi.fn(),
    updateQuery: { mutateAsync: vi.fn().mockResolvedValue({}) },
    queryClient: new QueryClient(),
    versionHistoryKeys: {
      list: (savedQueryId: string) =>
        ["versionHistory", "list", savedQueryId] as const,
    },
  };
}

describe("useVersionHistoryFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores non-string argument (e.g. click event) and opens active tab query id", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    result.current.handleOpenVersionHistory({} as unknown as string);

    expect(opts.openVersionHistory).toHaveBeenCalledTimes(1);
    expect(opts.openVersionHistory).toHaveBeenCalledWith("sq-1");
    expect(opts.closeVersionHistory).not.toHaveBeenCalled();
  });

  it("opens warning dialog when tab isDirty", () => {
    const opts = createDefaultOptions();
    opts.activeTab = {
      ...opts.activeTab,
      isDirty: true,
    };

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleOpenVersionHistory("sq-1");
    });

    expect(result.current.isWarningOpen).toBe(true);
    expect(opts.openVersionHistory).not.toHaveBeenCalled();
  });

  it("handleWarningCancel closes warning, resets pending", () => {
    const opts = createDefaultOptions();
    opts.activeTab = { ...opts.activeTab, isDirty: true };

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleOpenVersionHistory("sq-1");
    });
    expect(result.current.isWarningOpen).toBe(true);

    act(() => {
      result.current.handleWarningCancel();
    });

    expect(result.current.isWarningOpen).toBe(false);
  });

  it("handleContinueWithoutSaving closes warning, opens version history", () => {
    const opts = createDefaultOptions();
    opts.activeTab = { ...opts.activeTab, isDirty: true };

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleOpenVersionHistory("sq-1");
    });

    act(() => {
      result.current.handleContinueWithoutSaving();
    });

    expect(result.current.isWarningOpen).toBe(false);
    expect(opts.openVersionHistory).toHaveBeenCalledWith("sq-1");
  });

  it("handleSaveAndContinue saves, marks saved, toasts success", async () => {
    const opts = createDefaultOptions();
    opts.activeTab = { ...opts.activeTab, isDirty: true };

    const invalidateSpy = vi
      .spyOn(opts.queryClient, "invalidateQueries")
      .mockResolvedValue();

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleOpenVersionHistory("sq-1");
    });

    await act(async () => {
      await result.current.handleSaveAndContinue();
    });

    expect(opts.updateQuery.mutateAsync).toHaveBeenCalledWith({
      id: "sq-1",
      data: { sqlText: "SELECT 1" },
    });
    expect(opts.storeMarkTabSaved).toHaveBeenCalledWith(
      "tab-1",
      "sq-1",
      "Test Query",
    );
    expect(mockToast.success).toHaveBeenCalledWith("Query saved");
    expect(invalidateSpy).toHaveBeenCalled();
    expect(opts.openVersionHistory).toHaveBeenCalledWith("sq-1");
    expect(result.current.isWarningOpen).toBe(false);
  });

  it("handleSaveAndContinue error path: toasts error, does NOT open history", async () => {
    const opts = createDefaultOptions();
    opts.activeTab = { ...opts.activeTab, isDirty: true };
    opts.updateQuery.mutateAsync.mockRejectedValue(new Error("save failed"));

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleOpenVersionHistory("sq-1");
    });

    await act(async () => {
      await result.current.handleSaveAndContinue();
    });

    expect(mockToast.error).toHaveBeenCalledWith("Failed to save query", {
      description: "save failed",
    });
    expect(opts.openVersionHistory).not.toHaveBeenCalled();
  });

  it("handleVersionRestore updates tab content and switches to tab", () => {
    const opts = createDefaultOptions();
    opts.versionHistorySavedQueryId = "sq-1";
    opts.storeFindTabByQueryId.mockReturnValue({ id: "tab-1" });

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleVersionRestore("SELECT 2");
    });

    expect(opts.storeUpdateTabContent).toHaveBeenCalledWith(
      "tab-1",
      "SELECT 2",
    );
    expect(opts.storeSetActiveTab).toHaveBeenCalledWith("tab-1");
    expect(opts.closeVersionHistory).toHaveBeenCalled();
  });

  it("handleVersionRestore no-op when versionHistorySavedQueryId null", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleVersionRestore("SELECT 2");
    });

    expect(opts.storeUpdateTabContent).not.toHaveBeenCalled();
    expect(opts.storeSetActiveTab).not.toHaveBeenCalled();
    expect(opts.closeVersionHistory).not.toHaveBeenCalled();
  });

  it("handleOpenVersionHistory no-op when no targetQueryId", () => {
    const opts = createDefaultOptions();
    opts.activeTab = {
      id: "tab-1",
      queryId: undefined,
      name: "Untitled",
      content: "",
      isDirty: false,
    };

    const { result } = renderHook(() => useVersionHistoryFlow(opts));

    act(() => {
      result.current.handleOpenVersionHistory();
    });

    expect(opts.openVersionHistory).not.toHaveBeenCalled();
    expect(result.current.isWarningOpen).toBe(false);
  });
});
