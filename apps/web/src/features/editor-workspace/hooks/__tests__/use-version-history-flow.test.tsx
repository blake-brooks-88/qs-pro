import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useVersionHistoryFlow } from "../use-version-history-flow";

describe("useVersionHistoryFlow", () => {
  it("ignores non-string argument (e.g. click event) and opens active tab query id", () => {
    const openVersionHistory = vi.fn();
    const closeVersionHistory = vi.fn();

    const { result } = renderHook(() =>
      useVersionHistoryFlow({
        activeTabId: "tab-1",
        activeTab: {
          id: "tab-1",
          queryId: "sq-1",
          name: "Query 1",
          content: "select 1",
          isDirty: false,
        },
        versionHistorySavedQueryId: null,
        openVersionHistory,
        closeVersionHistory,
        storeFindTabByQueryId: () => undefined,
        storeUpdateTabContent: () => {},
        storeSetActiveTab: () => {},
        storeMarkTabSaved: () => {},
        updateQuery: { mutateAsync: async () => ({}) },
        queryClient: new QueryClient(),
        versionHistoryKeys: { list: () => ["versionHistory"] as const },
      }),
    );

    result.current.handleOpenVersionHistory({} as unknown as string);

    expect(openVersionHistory).toHaveBeenCalledTimes(1);
    expect(openVersionHistory).toHaveBeenCalledWith("sq-1");
    expect(closeVersionHistory).not.toHaveBeenCalled();
  });
});
