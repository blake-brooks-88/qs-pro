import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export function usePublishFlow(options: {
  activeTabId: string | null;
  activeTabLinkedSavedQueryId: string | undefined;
  activeTab: {
    queryId?: string;
    linkedQaCustomerKey?: string | null;
    linkedQaName?: string | null;
    name: string;
    content: string;
    isNew: boolean;
    isDirty: boolean;
  };
  driftCheck: {
    data?: { hasDrift?: boolean; remoteSql?: string } | undefined;
    refetch: () => Promise<{ data?: { hasDrift?: boolean } | undefined }>;
  };
  updateQuery: {
    mutateAsync: (args: {
      id: string;
      data: { sqlText: string };
    }) => Promise<unknown>;
    isPending?: boolean;
  };
  publishMutation: {
    mutateAsync: (args: {
      savedQueryId: string;
      versionId: string;
    }) => Promise<unknown>;
    isPending: boolean;
  };
  latestVersionId: string | null;
  storeUpdateTabContent: (tabId: string, content: string) => void;
  storeMarkTabSaved: (tabId: string, queryId: string, name: string) => void;
}): {
  showPublishConfirm: boolean;
  showDriftDialog: boolean;
  handlePublishClick: () => Promise<void>;
  handlePublishConfirm: () => Promise<void>;
  handleVersionPublish: (versionId: string) => void;
  handleDriftKeepMine: () => void;
  handleDriftAcceptTheirs: () => Promise<void>;
  closePublishConfirm: () => void;
  closeDriftDialog: () => void;
} {
  const {
    activeTabId,
    activeTabLinkedSavedQueryId,
    activeTab,
    driftCheck,
    updateQuery,
    publishMutation,
    latestVersionId,
    storeUpdateTabContent,
    storeMarkTabSaved,
  } = options;

  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [showDriftDialog, setShowDriftDialog] = useState(false);
  const [publishVersionId, setPublishVersionId] = useState<string | null>(null);

  const closePublishConfirm = useCallback(() => {
    setShowPublishConfirm(false);
    setPublishVersionId(null);
  }, []);

  const closeDriftDialog = useCallback(() => {
    setShowDriftDialog(false);
  }, []);

  const handleVersionPublish = useCallback((versionId: string) => {
    setPublishVersionId(versionId);
    setShowPublishConfirm(true);
  }, []);

  const handlePublishClick = useCallback(async () => {
    if (!activeTab.queryId || !activeTab.linkedQaCustomerKey) {
      return;
    }

    if (activeTab.isNew) {
      toast.warning("Save your query before publishing.");
      return;
    }
    if (activeTab.isDirty) {
      toast.warning("Save your changes before publishing.");
      return;
    }

    const result = await driftCheck.refetch();
    if (result.data?.hasDrift) {
      setShowDriftDialog(true);
    } else {
      setPublishVersionId(null);
      setShowPublishConfirm(true);
    }
  }, [
    activeTab.isDirty,
    activeTab.isNew,
    activeTab.linkedQaCustomerKey,
    activeTab.queryId,
    driftCheck,
  ]);

  const handleDriftKeepMine = useCallback(() => {
    setShowDriftDialog(false);
    setPublishVersionId(null);
    setShowPublishConfirm(true);
  }, []);

  const handleDriftAcceptTheirs = useCallback(async () => {
    if (!activeTab.queryId || !driftCheck.data?.remoteSql) {
      return;
    }
    try {
      await updateQuery.mutateAsync({
        id: activeTab.queryId,
        data: { sqlText: driftCheck.data.remoteSql },
      });
      if (activeTabId) {
        storeUpdateTabContent(activeTabId, driftCheck.data.remoteSql);
        storeMarkTabSaved(activeTabId, activeTab.queryId, activeTab.name);
      }
      toast.success("Accepted Automation Studio version as new local version.");
      setShowDriftDialog(false);
    } catch {
      toast.error("Failed to accept remote version.");
    }
  }, [
    activeTab.queryId,
    activeTab.name,
    driftCheck.data?.remoteSql,
    activeTabId,
    updateQuery,
    storeUpdateTabContent,
    storeMarkTabSaved,
  ]);

  const handlePublishConfirm = useCallback(async () => {
    if (!activeTab.queryId) {
      return;
    }
    const versionId = publishVersionId ?? latestVersionId;
    if (!versionId) {
      toast.error("No version available to publish.");
      return;
    }
    try {
      await publishMutation.mutateAsync({
        savedQueryId: activeTab.queryId,
        versionId,
      });
      setShowPublishConfirm(false);
      setPublishVersionId(null);
      toast.success("Published to Automation Studio.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      toast.error("Failed to publish", { description: message });
    }
  }, [activeTab.queryId, latestVersionId, publishMutation, publishVersionId]);

  // Drift check on linked query open (once per tab)
  const driftCheckedTabsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      !activeTabId ||
      !activeTabLinkedSavedQueryId ||
      driftCheckedTabsRef.current.has(activeTabId)
    ) {
      return;
    }
    driftCheckedTabsRef.current.add(activeTabId);
    void driftCheck.refetch().then((result) => {
      if (result.data?.hasDrift) {
        setShowDriftDialog(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on tab/link change
  }, [activeTabId, activeTabLinkedSavedQueryId]);

  return {
    showPublishConfirm,
    showDriftDialog,
    handlePublishClick,
    handlePublishConfirm,
    handleVersionPublish,
    handleDriftKeepMine,
    handleDriftAcceptTheirs,
    closePublishConfirm,
    closeDriftDialog,
  };
}
