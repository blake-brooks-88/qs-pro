import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockToast } from "@/test/mocks/sonner";

import { usePublishFlow } from "../use-publish-flow";

type PublishFlowOptions = Parameters<typeof usePublishFlow>[0];

function createDefaultOptions(): PublishFlowOptions & {
  driftCheck: PublishFlowOptions["driftCheck"] & {
    refetch: ReturnType<typeof vi.fn>;
  };
  updateQuery: PublishFlowOptions["updateQuery"] & {
    mutateAsync: ReturnType<typeof vi.fn>;
  };
  publishMutation: PublishFlowOptions["publishMutation"] & {
    mutateAsync: ReturnType<typeof vi.fn>;
  };
  storeUpdateTabContent: ReturnType<typeof vi.fn>;
  storeMarkTabSaved: ReturnType<typeof vi.fn>;
} {
  return {
    activeTabId: "tab-1",
    activeTabLinkedSavedQueryId: "sq-1",
    activeTab: {
      queryId: "sq-1",
      linkedQaCustomerKey: "qa-key-1",
      linkedQaName: "My QA",
      name: "Test Query",
      content: "SELECT 1",
      isNew: false,
      isDirty: false,
    },
    driftCheck: {
      data: { hasDrift: false, remoteSql: "SELECT 1" },
      refetch: vi.fn().mockResolvedValue({
        data: { hasDrift: false },
      }),
    },
    updateQuery: {
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    },
    publishMutation: {
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
    },
    latestVersionId: "ver-1",
    storeUpdateTabContent: vi.fn(),
    storeMarkTabSaved: vi.fn(),
  };
}

describe("usePublishFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handlePublishClick no-op when no queryId", async () => {
    const opts = createDefaultOptions();
    opts.activeTab = {
      ...opts.activeTab,
      queryId: undefined,
    };

    const { result } = renderHook(() => usePublishFlow(opts));

    const callsBefore = opts.driftCheck.refetch.mock.calls.length;

    await act(async () => {
      await result.current.handlePublishClick();
    });

    expect(opts.driftCheck.refetch.mock.calls).toHaveLength(callsBefore);
    expect(result.current.showPublishConfirm).toBe(false);
  });

  it("handlePublishClick no-op when no linkedQaCustomerKey", async () => {
    const opts = createDefaultOptions();
    opts.activeTab = {
      ...opts.activeTab,
      linkedQaCustomerKey: null,
      linkedQaName: null,
    };

    const { result } = renderHook(() => usePublishFlow(opts));

    const callsBefore = opts.driftCheck.refetch.mock.calls.length;

    await act(async () => {
      await result.current.handlePublishClick();
    });

    expect(opts.driftCheck.refetch.mock.calls).toHaveLength(callsBefore);
  });

  it("handlePublishClick toasts warning when isNew", async () => {
    const opts = createDefaultOptions();
    opts.activeTab = { ...opts.activeTab, isNew: true };

    const { result } = renderHook(() => usePublishFlow(opts));

    const callsBefore = opts.driftCheck.refetch.mock.calls.length;

    await act(async () => {
      await result.current.handlePublishClick();
    });

    expect(mockToast.warning).toHaveBeenCalledWith(
      "Save your query before publishing.",
    );
    expect(opts.driftCheck.refetch.mock.calls).toHaveLength(callsBefore);
  });

  it("handlePublishClick toasts warning when isDirty", async () => {
    const opts = createDefaultOptions();
    opts.activeTab = { ...opts.activeTab, isDirty: true };

    const { result } = renderHook(() => usePublishFlow(opts));

    const callsBefore = opts.driftCheck.refetch.mock.calls.length;

    await act(async () => {
      await result.current.handlePublishClick();
    });

    expect(mockToast.warning).toHaveBeenCalledWith(
      "Save your changes before publishing.",
    );
    expect(opts.driftCheck.refetch.mock.calls).toHaveLength(callsBefore);
  });

  it("handlePublishClick opens drift dialog when drift detected", async () => {
    const opts = createDefaultOptions();
    opts.driftCheck.refetch.mockResolvedValue({
      data: { hasDrift: true },
    });

    const { result } = renderHook(() => usePublishFlow(opts));

    await act(async () => {
      await result.current.handlePublishClick();
    });

    expect(result.current.showDriftDialog).toBe(true);
    expect(result.current.showPublishConfirm).toBe(false);
  });

  it("handlePublishClick opens confirm when no drift", async () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => usePublishFlow(opts));

    await act(async () => {
      await result.current.handlePublishClick();
    });

    expect(result.current.showPublishConfirm).toBe(true);
    expect(result.current.showDriftDialog).toBe(false);
  });

  it("handleDriftKeepMine opens publish confirm", () => {
    const opts = createDefaultOptions();
    const { result } = renderHook(() => usePublishFlow(opts));

    act(() => {
      result.current.handleDriftKeepMine();
    });

    expect(result.current.showDriftDialog).toBe(false);
    expect(result.current.showPublishConfirm).toBe(true);
  });

  it("handleDriftAcceptTheirs saves remote SQL, closes drift", async () => {
    const opts = createDefaultOptions();
    opts.driftCheck.data = { hasDrift: true, remoteSql: "SELECT 2" };

    const { result } = renderHook(() => usePublishFlow(opts));

    await act(async () => {
      await result.current.handleDriftAcceptTheirs();
    });

    expect(opts.updateQuery.mutateAsync).toHaveBeenCalledWith({
      id: "sq-1",
      data: { sqlText: "SELECT 2" },
    });
    expect(opts.storeUpdateTabContent).toHaveBeenCalledWith(
      "tab-1",
      "SELECT 2",
    );
    expect(opts.storeMarkTabSaved).toHaveBeenCalledWith(
      "tab-1",
      "sq-1",
      "Test Query",
    );
    expect(mockToast.success).toHaveBeenCalledWith(
      "Accepted Automation Studio version as new local version.",
    );
    expect(result.current.showDriftDialog).toBe(false);
  });

  it("handleDriftAcceptTheirs error toasts error", async () => {
    const opts = createDefaultOptions();
    opts.driftCheck.data = { hasDrift: true, remoteSql: "SELECT 2" };
    opts.updateQuery.mutateAsync.mockRejectedValue(new Error("fail"));

    const { result } = renderHook(() => usePublishFlow(opts));

    await act(async () => {
      await result.current.handleDriftAcceptTheirs();
    });

    expect(mockToast.error).toHaveBeenCalledWith(
      "Failed to accept remote version.",
    );
  });

  it("handlePublishConfirm publishes and toasts success", async () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => usePublishFlow(opts));

    await act(async () => {
      await result.current.handlePublishConfirm();
    });

    expect(opts.publishMutation.mutateAsync).toHaveBeenCalledWith({
      savedQueryId: "sq-1",
      versionId: "ver-1",
    });
    expect(mockToast.success).toHaveBeenCalledWith(
      "Published to Automation Studio.",
    );
    expect(result.current.showPublishConfirm).toBe(false);
  });

  it("handlePublishConfirm error toasts error", async () => {
    const opts = createDefaultOptions();
    opts.publishMutation.mutateAsync.mockRejectedValue(
      new Error("publish fail"),
    );

    const { result } = renderHook(() => usePublishFlow(opts));

    await act(async () => {
      await result.current.handlePublishConfirm();
    });

    expect(mockToast.error).toHaveBeenCalledWith("Failed to publish", {
      description: "publish fail",
    });
  });

  it("handleVersionPublish sets version ID and opens confirm", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => usePublishFlow(opts));

    act(() => {
      result.current.handleVersionPublish("ver-5");
    });

    expect(result.current.showPublishConfirm).toBe(true);
  });
});
