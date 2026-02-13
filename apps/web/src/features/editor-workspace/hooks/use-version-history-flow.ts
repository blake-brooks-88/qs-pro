import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function useVersionHistoryFlow(options: {
  activeTabId: string | null;
  activeTab: {
    id: string;
    queryId?: string;
    name: string;
    content: string;
    isDirty: boolean;
  };
  versionHistorySavedQueryId: string | null;
  openVersionHistory: (savedQueryId: string) => void;
  closeVersionHistory: () => void;
  storeFindTabByQueryId: (queryId: string) => { id: string } | undefined;
  storeUpdateTabContent: (tabId: string, content: string) => void;
  storeSetActiveTab: (tabId: string) => void;
  storeMarkTabSaved: (tabId: string, queryId: string, name: string) => void;
  updateQuery: {
    mutateAsync: (args: {
      id: string;
      data: { sqlText: string };
    }) => Promise<unknown>;
  };
  queryClient: QueryClient;
  versionHistoryKeys: {
    list: (savedQueryId: string) => readonly unknown[];
  };
}): {
  isWarningOpen: boolean;
  handleOpenVersionHistory: (queryId?: string) => void;
  handleVersionRestore: (sqlText: string) => void;
  handleWarningCancel: () => void;
  handleContinueWithoutSaving: () => void;
  handleSaveAndContinue: () => Promise<void>;
} {
  const {
    activeTabId,
    activeTab,
    versionHistorySavedQueryId,
    openVersionHistory,
    closeVersionHistory,
    storeFindTabByQueryId,
    storeUpdateTabContent,
    storeSetActiveTab,
    storeMarkTabSaved,
    updateQuery,
    queryClient,
    versionHistoryKeys,
  } = options;

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [pendingQueryId, setPendingQueryId] = useState<string | null>(null);

  const handleOpenVersionHistory = useCallback(
    (queryId?: string) => {
      const explicitQueryId = typeof queryId === "string" ? queryId : undefined;
      const targetQueryId = explicitQueryId ?? activeTab.queryId;
      if (!targetQueryId) {
        return;
      }

      if (activeTab.isDirty && activeTab.queryId === targetQueryId) {
        setPendingQueryId(targetQueryId);
        setIsWarningOpen(true);
        return;
      }

      openVersionHistory(targetQueryId);
    },
    [activeTab.isDirty, activeTab.queryId, openVersionHistory],
  );

  const handleVersionRestore = useCallback(
    (sqlText: string) => {
      if (!versionHistorySavedQueryId) {
        return;
      }
      const targetTab = storeFindTabByQueryId(versionHistorySavedQueryId);
      if (targetTab) {
        storeUpdateTabContent(targetTab.id, sqlText);
        storeSetActiveTab(targetTab.id);
      }
      closeVersionHistory();
    },
    [
      closeVersionHistory,
      storeFindTabByQueryId,
      storeSetActiveTab,
      storeUpdateTabContent,
      versionHistorySavedQueryId,
    ],
  );

  const handleWarningCancel = useCallback(() => {
    setIsWarningOpen(false);
    setPendingQueryId(null);
  }, []);

  const handleContinueWithoutSaving = useCallback(() => {
    const queryId = pendingQueryId;
    setIsWarningOpen(false);
    setPendingQueryId(null);
    if (queryId) {
      openVersionHistory(queryId);
    }
  }, [openVersionHistory, pendingQueryId]);

  const handleSaveAndContinue = useCallback(async () => {
    const queryId = pendingQueryId;
    setIsWarningOpen(false);
    setPendingQueryId(null);

    if (activeTab.queryId && activeTab.isDirty) {
      try {
        await updateQuery.mutateAsync({
          id: activeTab.queryId,
          data: { sqlText: activeTab.content },
        });
        if (activeTabId) {
          storeMarkTabSaved(activeTabId, activeTab.queryId, activeTab.name);
        }
        toast.success("Query saved");

        void queryClient.invalidateQueries({
          queryKey: versionHistoryKeys.list(activeTab.queryId),
        });
      } catch (error) {
        toast.error("Failed to save query", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
        return;
      }
    }

    if (queryId) {
      openVersionHistory(queryId);
    }
  }, [
    activeTab.content,
    activeTab.isDirty,
    activeTab.name,
    activeTab.queryId,
    activeTabId,
    openVersionHistory,
    pendingQueryId,
    queryClient,
    storeMarkTabSaved,
    updateQuery,
    versionHistoryKeys,
  ]);

  return {
    isWarningOpen,
    handleOpenVersionHistory,
    handleVersionRestore,
    handleWarningCancel,
    handleContinueWithoutSaving,
    handleSaveAndContinue,
  };
}
