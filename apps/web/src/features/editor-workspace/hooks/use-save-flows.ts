import type { QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

export function useSaveFlows(options: {
  activeTabId: string | null;
  activeTab: {
    id: string;
    queryId?: string;
    name: string;
    content: string;
    isDirty: boolean;
  };
  storeMarkTabSaved: (tabId: string, queryId: string, name: string) => void;
  storeOpenQuery: (
    queryId: string,
    name: string,
    content: string,
    linkState?: {
      linkedQaCustomerKey: string | null;
      linkedQaName: string | null;
    },
  ) => string;
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
  onSave?: (tabId: string, content: string) => void;
}): {
  isSaveModalOpen: boolean;
  saveModalInitialName: string;
  openSaveModal: () => void;
  closeSaveModal: () => void;
  handleSave: () => Promise<void>;
  handleSaveAs: () => void;
  handleSaveModalSuccess: (queryId: string, name: string) => void;
} {
  const {
    activeTabId,
    activeTab,
    storeMarkTabSaved,
    storeOpenQuery,
    updateQuery,
    queryClient,
    versionHistoryKeys,
    onSave,
  } = options;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaveAsMode, setIsSaveAsMode] = useState(false);
  const [saveAsInitialName, setSaveAsInitialName] = useState("");

  const saveModalInitialName = useMemo(() => {
    return isSaveAsMode ? saveAsInitialName : activeTab.name;
  }, [activeTab.name, isSaveAsMode, saveAsInitialName]);

  const openSaveModal = useCallback(() => {
    setIsSaveModalOpen(true);
  }, []);

  const closeSaveModal = useCallback(() => {
    setIsSaveModalOpen(false);
    setIsSaveAsMode(false);
    setSaveAsInitialName("");
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeTab.queryId) {
      openSaveModal();
      return;
    }

    if (!activeTab.isDirty) {
      return;
    }

    try {
      await updateQuery.mutateAsync({
        id: activeTab.queryId,
        data: { sqlText: activeTab.content },
      });

      if (activeTabId) {
        storeMarkTabSaved(activeTabId, activeTab.queryId, activeTab.name);
      }

      toast.success("Query saved");
      onSave?.(activeTab.id, activeTab.content);

      void queryClient.invalidateQueries({
        queryKey: versionHistoryKeys.list(activeTab.queryId),
      });
    } catch (error) {
      toast.error("Failed to save query", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  }, [
    activeTab.content,
    activeTab.id,
    activeTab.isDirty,
    activeTab.name,
    activeTab.queryId,
    activeTabId,
    openSaveModal,
    onSave,
    queryClient,
    storeMarkTabSaved,
    updateQuery,
    versionHistoryKeys,
  ]);

  const handleSaveAs = useCallback(() => {
    const name = activeTab.name || "Untitled";
    setSaveAsInitialName(`${name} (copy)`);
    setIsSaveAsMode(true);
    openSaveModal();
  }, [activeTab.name, openSaveModal]);

  const handleSaveModalSuccess = useCallback(
    (queryId: string, name: string) => {
      if (isSaveAsMode) {
        storeOpenQuery(queryId, name, activeTab.content ?? "");
      } else if (activeTabId) {
        storeMarkTabSaved(activeTabId, queryId, name);
      }
    },
    [
      activeTab.content,
      activeTabId,
      isSaveAsMode,
      storeMarkTabSaved,
      storeOpenQuery,
    ],
  );

  return {
    isSaveModalOpen,
    saveModalInitialName,
    openSaveModal,
    closeSaveModal,
    handleSave,
    handleSaveAs,
    handleSaveModalSuccess,
  };
}
