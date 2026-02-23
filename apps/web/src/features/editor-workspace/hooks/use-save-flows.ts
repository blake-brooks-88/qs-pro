import type { SavedQueryResponse } from "@qpp/shared-types";
import type { QueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import api from "@/services/api";

export interface StaleConflict {
  conflictingUserName: string | null;
}

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
      data: { sqlText: string; expectedHash?: string };
    }) => Promise<SavedQueryResponse>;
  };
  queryClient: QueryClient;
  versionHistoryKeys: {
    list: (savedQueryId: string) => readonly unknown[];
  };
  storeUpdateTabContent?: (tabId: string, content: string) => void;
  onSave?: (tabId: string, content: string) => void;
  isActiveQueryInSharedFolder?: boolean;
  openedHash: string | null;
  onHashUpdated?: (newHash: string) => void;
}): {
  isSaveModalOpen: boolean;
  saveModalInitialName: string;
  openSaveModal: () => void;
  closeSaveModal: () => void;
  handleSave: () => Promise<void>;
  handleSaveAs: () => void;
  handleSaveModalSuccess: (queryId: string, name: string) => void;
  staleConflict: StaleConflict | null;
  handleStaleOverwrite: () => void;
  handleStaleReload: () => void;
  handleStaleCancel: () => void;
} {
  const {
    activeTabId,
    activeTab,
    storeMarkTabSaved,
    storeOpenQuery,
    updateQuery,
    queryClient,
    versionHistoryKeys,
    storeUpdateTabContent,
    onSave,
    isActiveQueryInSharedFolder = false,
    openedHash,
    onHashUpdated,
  } = options;

  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isSaveAsMode, setIsSaveAsMode] = useState(false);
  const [saveAsInitialName, setSaveAsInitialName] = useState("");
  const [staleConflict, setStaleConflict] = useState<StaleConflict | null>(
    null,
  );

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

  const executeSave = useCallback(
    async (forceOverwrite = false) => {
      if (!activeTab.queryId) {
        openSaveModal();
        return;
      }

      if (!activeTab.isDirty && !forceOverwrite) {
        return;
      }

      const data: { sqlText: string; expectedHash?: string } = {
        sqlText: activeTab.content,
      };

      if (isActiveQueryInSharedFolder && openedHash && !forceOverwrite) {
        data.expectedHash = openedHash;
      }

      try {
        const response = await updateQuery.mutateAsync({
          id: activeTab.queryId,
          data,
        });

        if (activeTabId) {
          storeMarkTabSaved(activeTabId, activeTab.queryId, activeTab.name);
        }

        if (response.latestVersionHash) {
          onHashUpdated?.(response.latestVersionHash);
        }

        toast.success("Query saved");
        onSave?.(activeTab.id, activeTab.content);

        void queryClient.invalidateQueries({
          queryKey: versionHistoryKeys.list(activeTab.queryId),
        });
      } catch (error) {
        if (
          axios.isAxiosError(error) &&
          error.response?.status === 409 &&
          (error.response.data as { code?: string })?.code === "STALE_CONTENT"
        ) {
          setStaleConflict({ conflictingUserName: null });
          return;
        }

        toast.error("Failed to save query", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
      }
    },
    [
      activeTab.content,
      activeTab.id,
      activeTab.isDirty,
      activeTab.name,
      activeTab.queryId,
      activeTabId,
      isActiveQueryInSharedFolder,
      openedHash,
      openSaveModal,
      onHashUpdated,
      onSave,
      queryClient,
      storeMarkTabSaved,
      updateQuery,
      versionHistoryKeys,
    ],
  );

  const handleSave = useCallback(async () => {
    await executeSave(false);
  }, [executeSave]);

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

  const handleStaleOverwrite = useCallback(() => {
    setStaleConflict(null);
    void executeSave(true);
  }, [executeSave]);

  const reloadLatest = useCallback(async () => {
    if (!activeTab.queryId || !activeTabId) {
      return;
    }

    try {
      const response = await api.get<SavedQueryResponse>(
        `/saved-queries/${activeTab.queryId}`,
      );
      const latest = response.data;

      storeUpdateTabContent?.(activeTabId, latest.sqlText);
      storeMarkTabSaved(activeTabId, activeTab.queryId, latest.name);

      if (latest.latestVersionHash) {
        onHashUpdated?.(latest.latestVersionHash);
      }

      void queryClient.invalidateQueries({
        queryKey: ["saved-query", activeTab.queryId],
      });

      toast.info("Reloaded latest version");
    } catch {
      toast.error("Failed to reload query");
    }
  }, [
    activeTab.queryId,
    activeTabId,
    storeUpdateTabContent,
    storeMarkTabSaved,
    onHashUpdated,
    queryClient,
  ]);

  const handleStaleReload = useCallback(() => {
    setStaleConflict(null);
    void reloadLatest();
  }, [reloadLatest]);

  const handleStaleCancel = useCallback(() => {
    setStaleConflict(null);
  }, []);

  return {
    isSaveModalOpen,
    saveModalInitialName,
    openSaveModal,
    closeSaveModal,
    handleSave,
    handleSaveAs,
    handleSaveModalSuccess,
    staleConflict,
    handleStaleOverwrite,
    handleStaleReload,
    handleStaleCancel,
  };
}
