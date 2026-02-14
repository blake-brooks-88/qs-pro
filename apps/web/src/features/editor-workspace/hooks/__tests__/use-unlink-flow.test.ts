import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTabStub } from "@/test/stubs";

import { useUnlinkFlow } from "../use-unlink-flow";

type UnlinkFlowOptions = Parameters<typeof useUnlinkFlow>[0];

function createDefaultOptions(): UnlinkFlowOptions & {
  storeFindTabByQueryId: ReturnType<typeof vi.fn>;
  storeCloseTab: ReturnType<typeof vi.fn>;
  storeUpdateTabLinkState: ReturnType<typeof vi.fn>;
  onTabClose: ReturnType<typeof vi.fn>;
} {
  const tab = createTabStub({
    linkedQaCustomerKey: "qa-key-1",
    linkedQaName: "My QA",
  });

  return {
    savedQueries: [
      {
        id: tab.queryId ?? "",
        name: tab.name,
        linkedQaCustomerKey: tab.linkedQaCustomerKey ?? null,
        linkedQaName: tab.linkedQaName ?? null,
      },
    ],
    storeFindTabByQueryId: vi.fn().mockReturnValue({
      id: tab.id,
      name: tab.name,
      linkedQaCustomerKey: tab.linkedQaCustomerKey,
      linkedQaName: tab.linkedQaName,
    }),
    storeCloseTab: vi.fn(),
    storeUpdateTabLinkState: vi.fn(),
    onTabClose: vi.fn(),
  };
}

describe("useUnlinkFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("openUnlinkModal sets unlinkTarget from tab data", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => useUnlinkFlow(opts));

    act(() => {
      result.current.openUnlinkModal("sq-1");
    });

    expect(result.current.unlinkTarget).toEqual({
      savedQueryId: "sq-1",
      savedQueryName: "Test Query",
      linkedQaName: "My QA",
      linkedQaCustomerKey: "qa-key-1",
    });
  });

  it("openUnlinkModal returns early when no qaKey", () => {
    const opts = createDefaultOptions();
    opts.storeFindTabByQueryId.mockReturnValue({
      id: "tab-1",
      name: "Test Query",
      linkedQaCustomerKey: null,
      linkedQaName: null,
    });
    opts.savedQueries = [
      {
        id: "sq-1",
        name: "Test Query",
        linkedQaCustomerKey: null,
        linkedQaName: null,
      },
    ];

    const { result } = renderHook(() => useUnlinkFlow(opts));

    act(() => {
      result.current.openUnlinkModal("sq-1");
    });

    expect(result.current.unlinkTarget).toBeNull();
  });

  it("handleUnlinkComplete closes tab when deleteLocal", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => useUnlinkFlow(opts));

    act(() => {
      result.current.openUnlinkModal("sq-1");
    });

    act(() => {
      result.current.handleUnlinkComplete({
        deleteLocal: true,
        deleteRemote: false,
      });
    });

    expect(opts.storeCloseTab).toHaveBeenCalledWith("tab-1");
    expect(opts.onTabClose).toHaveBeenCalledWith("tab-1");
    expect(opts.storeUpdateTabLinkState).not.toHaveBeenCalled();
    expect(result.current.unlinkTarget).toBeNull();
  });

  it("handleUnlinkComplete clears link state when not deleteLocal", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => useUnlinkFlow(opts));

    act(() => {
      result.current.openUnlinkModal("sq-1");
    });

    act(() => {
      result.current.handleUnlinkComplete({
        deleteLocal: false,
        deleteRemote: false,
      });
    });

    expect(opts.storeUpdateTabLinkState).toHaveBeenCalledWith("tab-1", {
      linkedQaCustomerKey: null,
      linkedQaName: null,
    });
    expect(opts.storeCloseTab).not.toHaveBeenCalled();
    expect(result.current.unlinkTarget).toBeNull();
  });

  it("handleUnlinkComplete no-op when unlinkTarget null", () => {
    const opts = createDefaultOptions();

    const { result } = renderHook(() => useUnlinkFlow(opts));

    act(() => {
      result.current.handleUnlinkComplete({
        deleteLocal: true,
        deleteRemote: false,
      });
    });

    expect(opts.storeCloseTab).not.toHaveBeenCalled();
    expect(opts.storeUpdateTabLinkState).not.toHaveBeenCalled();
  });
});
