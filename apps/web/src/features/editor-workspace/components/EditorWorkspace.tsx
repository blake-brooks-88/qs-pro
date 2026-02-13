import type { CreateDataExtensionDto } from "@qpp/shared-types";
import type { LinkQueryResponse } from "@qpp/shared-types";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ActivityBar } from "@/components/ActivityBar";
import { UpgradeModal } from "@/components/UpgradeModal";
import { UsageWarningBanner } from "@/components/UsageWarningBanner";
import { useBeforeUnloadDirtyTabs } from "@/features/editor-workspace/hooks/use-before-unload-dirty-tabs";
import { useBlastRadius } from "@/features/editor-workspace/hooks/use-blast-radius";
import { useCreateQueryActivity } from "@/features/editor-workspace/hooks/use-create-query-activity";
import { useDriftCheck } from "@/features/editor-workspace/hooks/use-drift-check";
import { useLazyOpenSavedQuery } from "@/features/editor-workspace/hooks/use-lazy-open-saved-query";
import { useLinkQuery } from "@/features/editor-workspace/hooks/use-link-query";
import { metadataQueryKeys } from "@/features/editor-workspace/hooks/use-metadata";
import { usePublishFlow } from "@/features/editor-workspace/hooks/use-publish-flow";
import { usePublishQuery } from "@/features/editor-workspace/hooks/use-publish-query";
import {
  queryActivityFoldersQueryKeys,
  useQueryActivityFolders,
} from "@/features/editor-workspace/hooks/use-query-activity-folders";
import { useQueryExecution } from "@/features/editor-workspace/hooks/use-query-execution";
import {
  useQueryVersions,
  versionHistoryKeys,
} from "@/features/editor-workspace/hooks/use-query-versions";
import { useResultsPaneResize } from "@/features/editor-workspace/hooks/use-results-pane-resize";
import { useSaveFlows } from "@/features/editor-workspace/hooks/use-save-flows";
import { useUpdateSavedQuery } from "@/features/editor-workspace/hooks/use-saved-queries";
import { useUnlinkFlow } from "@/features/editor-workspace/hooks/use-unlink-flow";
import { useVersionHistoryFlow } from "@/features/editor-workspace/hooks/use-version-history-flow";
import { useActivityBarStore } from "@/features/editor-workspace/store/activity-bar-store";
import { useVersionHistoryStore } from "@/features/editor-workspace/store/version-history-store";
import type {
  DataExtensionDraft,
  DataExtensionField,
  EditorWorkspaceProps,
  ExecutionResult,
  QueryActivityDraft,
  TargetUpdateType,
} from "@/features/editor-workspace/types";
import { adaptExecutionResult } from "@/features/editor-workspace/utils/execution-result-adapter";
import {
  getRunBlockMessage,
  getRunLimitFlags,
  getRunTooltipMessage,
} from "@/features/editor-workspace/utils/run-gating";
import {
  getFirstBlockingDiagnostic,
  hasBlockingDiagnostics as checkHasBlockingDiagnostics,
} from "@/features/editor-workspace/utils/sql-lint";
import { useSqlDiagnostics } from "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics";
import { useFeature } from "@/hooks/use-feature";
import { useRunUsage } from "@/hooks/use-run-usage";
import { useTier, WARNING_THRESHOLD } from "@/hooks/use-tier";
import { copyToClipboard } from "@/lib/clipboard";
import { createDataExtension } from "@/services/metadata";
import { useTabsStore } from "@/store/tabs-store";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { EditorResultsPane } from "./EditorResultsPane";
import { EditorToolbar } from "./EditorToolbar";
import { EditorWorkspaceModals } from "./EditorWorkspaceModals";
import { HistoryPanel } from "./HistoryPanel";
import { MonacoQueryEditor } from "./MonacoQueryEditor";
import { QueryTabBar } from "./QueryTabBar";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import { VersionHistoryWarningDialog } from "./VersionHistoryWarningDialog";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function EditorWorkspace({
  tenantId,
  eid,
  folders,
  savedQueries,
  dataExtensions,
  executionResult: externalExecutionResult,
  initialTabs,
  isSidebarCollapsed: _initialSidebarCollapsed,
  isDataExtensionsFetching = false,
  guardrailMessage: _guardrailMessageProp,
  guardrailTitle: _guardrailTitleProp = "Guardrail Violation",
  onSave,
  onSaveAs: _onSaveAs,
  onFormat,
  onDeploy: _onDeploy,
  onCreateQueryActivity: _onCreateQueryActivity,
  onSelectQuery,
  onSelectDE,
  onToggleSidebar: _onToggleSidebar,
  onPageChange,
  onViewInContactBuilder,
  onCreateDE,
  onTabClose,
  onTabChange,
  onNewTab: _onNewTab,
}: EditorWorkspaceProps) {
  const activeView = useActivityBarStore((s) => s.activeView);
  const historyQueryIdFilter = useActivityBarStore(
    (s) => s.historyQueryIdFilter,
  );
  const setActiveView = useActivityBarStore((s) => s.setActiveView);
  const showHistoryForQuery = useActivityBarStore((s) => s.showHistoryForQuery);

  const [isDEModalOpen, setIsDEModalOpen] = useState(false);
  const [isQueryActivityModalOpen, setIsQueryActivityModalOpen] =
    useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const [tabToClose, setTabToClose] = useState<string | null>(null);
  const [isRunBlockedOpen, setIsRunBlockedOpen] = useState(false);
  const [isTargetDEModalOpen, setIsTargetDEModalOpen] = useState(false);
  const [inferredFields, setInferredFields] = useState<DataExtensionField[]>(
    [],
  );
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkTargetQueryId, setLinkTargetQueryId] = useState<string | null>(
    null,
  );

  // Publish flow state
  // (handled via usePublishFlow below)

  // Unlink flow state
  // (handled via useUnlinkFlow below)

  // Version History state
  const versionHistoryIsOpen = useVersionHistoryStore((s) => s.isOpen);
  const versionHistorySavedQueryId = useVersionHistoryStore(
    (s) => s.savedQueryId,
  );
  const openVersionHistory = useVersionHistoryStore(
    (s) => s.openVersionHistory,
  );
  const closeVersionHistory = useVersionHistoryStore(
    (s) => s.closeVersionHistory,
  );

  // TanStack Query client for metadata fetching
  const queryClient = useQueryClient();

  // Quota hooks
  const { tier } = useTier();
  const { data: usageData } = useRunUsage();

  const {
    execute,
    cancel,
    status: executionStatus,
    isRunning,
    runId,
    errorMessage: executionErrorMessage,
    results,
    currentPage,
    setPage,
  } = useQueryExecution({ tenantId, eid });

  // Mutation for auto-saving existing queries
  const updateQuery = useUpdateSavedQuery();

  // Query Activity hooks
  const { data: qaFolders = [] } = useQueryActivityFolders(eid);
  const createQueryActivityMutation = useCreateQueryActivity();
  const linkMutation = useLinkQuery();
  const publishMutation = usePublishQuery();
  const { enabled: isDeployFeatureEnabled } = useFeature("deployToAutomation");

  // Zustand store - single source of truth for tabs
  const tabs = useTabsStore((state) => state.tabs);
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const activeTab = useTabsStore((state) => state.getActiveTab());
  const storeSetActiveTab = useTabsStore((state) => state.setActiveTab);
  const storeCloseTab = useTabsStore((state) => state.closeTab);
  const storeUpdateTabContent = useTabsStore((state) => state.updateTabContent);
  const storeMarkTabSaved = useTabsStore((state) => state.markTabSaved);
  const storeOpenQuery = useTabsStore((state) => state.openQuery);
  const storeCreateNewTab = useTabsStore((state) => state.createNewTab);
  const storeReset = useTabsStore((state) => state.reset);
  const storeFindTabByQueryId = useTabsStore((state) => state.findTabByQueryId);
  const storeUpdateTabLinkState = useTabsStore(
    (state) => state.updateTabLinkState,
  );

  const [cursorPosition, setCursorPosition] = useState<number | undefined>(
    undefined,
  );
  const workspaceRef = useRef<HTMLDivElement>(null);
  const {
    isResultsOpen,
    resultsHeight,
    isResizingResults,
    openResultsPane,
    toggleResultsPane,
    handleResultsResizeStart,
  } = useResultsPaneResize({ workspaceRef });

  // Track if store has been initialized
  const initializedRef = useRef(false);

  // Initialize Zustand store on mount with initialTabs or create default tab
  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;

    // Reset store first
    storeReset();

    // Populate with initialTabs if provided
    if (initialTabs && initialTabs.length > 0) {
      initialTabs.forEach((tab) => {
        if (tab.queryId) {
          storeOpenQuery(tab.queryId, tab.name, tab.content);
        } else {
          const id = storeCreateNewTab();
          if (tab.content) {
            storeUpdateTabContent(id, tab.content);
          }
        }
      });
    } else {
      // Create a default tab if store is empty
      storeCreateNewTab();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  // Fallback active tab - ensure we always have a valid tab
  const safeActiveTab = useMemo(() => {
    if (activeTab) {
      return activeTab;
    }
    const firstTab = tabs[0];
    if (firstTab) {
      return firstTab;
    }
    // This should never happen, but provide a fallback
    return {
      id: "fallback",
      name: "New Query",
      content: "",
      originalContent: "",
      isDirty: false,
      isNew: true,
    };
  }, [activeTab, tabs]);

  const {
    isSaveModalOpen,
    saveModalInitialName,
    openSaveModal,
    closeSaveModal,
    handleSave,
    handleSaveAs,
    handleSaveModalSuccess,
  } = useSaveFlows({
    activeTabId,
    activeTab: safeActiveTab,
    storeMarkTabSaved,
    storeOpenQuery,
    updateQuery,
    queryClient,
    versionHistoryKeys,
    onSave,
  });

  const {
    isWarningOpen: isVersionHistoryWarningOpen,
    handleOpenVersionHistory,
    handleVersionRestore,
    handleWarningCancel: handleVersionHistoryWarningCancel,
    handleContinueWithoutSaving: handleVersionHistoryContinueWithoutSaving,
    handleSaveAndContinue: handleVersionHistorySaveAndContinue,
  } = useVersionHistoryFlow({
    activeTabId,
    activeTab: safeActiveTab,
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
  });

  const {
    unlinkTarget,
    openUnlinkModal: handleOpenUnlinkModal,
    closeUnlinkModal,
    handleUnlinkComplete,
  } = useUnlinkFlow({
    savedQueries,
    storeFindTabByQueryId,
    storeCloseTab,
    storeUpdateTabLinkState,
    onTabClose,
  });

  // Publish-related: derive linked saved query ID for the active tab
  const activeTabLinkedSavedQueryId = useMemo(() => {
    if (safeActiveTab.queryId && safeActiveTab.linkedQaCustomerKey) {
      return safeActiveTab.queryId;
    }
    return undefined;
  }, [safeActiveTab.queryId, safeActiveTab.linkedQaCustomerKey]);

  const driftCheck = useDriftCheck(activeTabLinkedSavedQueryId);
  const { data: versionsData } = useQueryVersions(activeTabLinkedSavedQueryId);

  const latestVersionId = useMemo(() => {
    const versions = versionsData?.versions;
    if (!versions || versions.length === 0) {
      return null;
    }
    const sorted = [...versions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return sorted[0]?.id ?? null;
  }, [versionsData?.versions]);

  const {
    showPublishConfirm,
    showDriftDialog,
    handlePublishClick,
    handlePublishConfirm,
    handleVersionPublish,
    handleDriftKeepMine,
    handleDriftAcceptTheirs,
    closePublishConfirm,
    closeDriftDialog,
  } = usePublishFlow({
    activeTabId,
    activeTabLinkedSavedQueryId,
    activeTab: safeActiveTab,
    driftCheck,
    updateQuery,
    publishMutation,
    latestVersionId,
    storeUpdateTabContent,
    storeMarkTabSaved,
  });

  const blastRadius = useBlastRadius(
    showPublishConfirm ? activeTabLinkedSavedQueryId : undefined,
  );
  const toolbarBlastRadius = useBlastRadius(activeTabLinkedSavedQueryId);

  // Use the new hook that merges sync (legacy/prereq) and async (AST worker) diagnostics
  const sqlDiagnostics = useSqlDiagnostics(safeActiveTab.content, {
    dataExtensions,
    cursorPosition,
  });

  // Only "error" and "prereq" severities block execution.
  // "warning" is advisory only and NEVER blocks execution.
  const hasBlockingDiagnostics = useMemo(
    () => checkHasBlockingDiagnostics(sqlDiagnostics),
    [sqlDiagnostics],
  );

  // Get blocking diagnostic with correct priority (error first, then prereq).
  // Warnings are excluded from blocking diagnostics.
  const blockingDiagnostic = useMemo(
    () => getFirstBlockingDiagnostic(sqlDiagnostics),
    [sqlDiagnostics],
  );

  const { isAtRunLimit, isNearRunLimit } = useMemo(
    () => getRunLimitFlags(usageData, WARNING_THRESHOLD),
    [usageData],
  );

  const runBlockMessage = useMemo(() => {
    return getRunBlockMessage(blockingDiagnostic, safeActiveTab.content);
  }, [safeActiveTab.content, blockingDiagnostic]);

  const runTooltipMessage = useMemo(() => {
    return getRunTooltipMessage({
      isRunning,
      isAtRunLimit,
      hasBlockingDiagnostics,
      runBlockMessage,
    });
  }, [isRunning, isAtRunLimit, hasBlockingDiagnostics, runBlockMessage]);

  // Derive link target info for LinkQueryModal
  const linkTargetInfo = useMemo(() => {
    if (!linkTargetQueryId) {
      return null;
    }
    const tab = storeFindTabByQueryId(linkTargetQueryId);
    if (tab) {
      return { id: linkTargetQueryId, name: tab.name, sql: tab.content };
    }
    return { id: linkTargetQueryId, name: "Query", sql: "" };
  }, [linkTargetQueryId, storeFindTabByQueryId]);

  const executionResult: ExecutionResult = useMemo(() => {
    return adaptExecutionResult({
      externalExecutionResult,
      executionStatus,
      runId,
      executionErrorMessage,
      resultsData: results.data,
      resultsError: results.error,
      currentPage,
    });
  }, [
    externalExecutionResult,
    executionStatus,
    runId,
    executionErrorMessage,
    results.data,
    results.error,
    currentPage,
  ]);

  const { requestOpenSavedQuery } = useLazyOpenSavedQuery({
    onOpenSavedQuery: (query) => {
      storeOpenQuery(
        query.id,
        query.name,
        query.sqlText,
        query.linkedQaCustomerKey || query.linkedQaName
          ? {
              linkedQaCustomerKey: query.linkedQaCustomerKey,
              linkedQaName: query.linkedQaName,
            }
          : undefined,
      );
    },
  });

  useBeforeUnloadDirtyTabs(tabs);

  useEffect(() => {
    if (executionResult.status !== "idle") {
      openResultsPane();
    }
  }, [executionResult.status, openResultsPane]);

  const handleCreateDE = async () => {
    // Lazy load both inferrer and fetcher to avoid bundle impact
    try {
      const [{ inferSchemaFromQuery }, { createMetadataFetcher }] =
        await Promise.all([
          import("../utils/schema-inferrer"),
          import("../utils/metadata-fetcher"),
        ]);
      const fetcher = createMetadataFetcher(queryClient, tenantId, eid);
      const fields = await inferSchemaFromQuery(safeActiveTab.content, fetcher);
      setInferredFields(fields);
    } catch {
      // Parsing failed - show empty modal
      toast.error("Could not infer schema from query");
      setInferredFields([]);
    }

    setIsDEModalOpen(true);
    onCreateDE?.();
  };

  const handleSaveDataExtension = useCallback(
    async (draft: DataExtensionDraft) => {
      // Map DataExtensionDraft to CreateDataExtensionDto (strip client-side id from fields)
      const dto: CreateDataExtensionDto = {
        name: draft.name,
        ...(draft.customerKey && { customerKey: draft.customerKey }),
        folderId: draft.folderId,
        isSendable: draft.isSendable,
        subscriberKeyField: draft.subscriberKeyField,
        retention: draft.retention,
        fields: draft.fields.map(({ id: _id, ...field }) => field),
      };

      try {
        await createDataExtension(dto);
        toast.success(`Data Extension "${draft.name}" created`);
        const queryKey = metadataQueryKeys.dataExtensions(tenantId, eid);
        await queryClient.invalidateQueries({ queryKey });
        await queryClient.refetchQueries({ queryKey, type: "all" });
      } catch (error) {
        toast.error("Failed to create Data Extension", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
        throw error;
      }
    },
    [queryClient, tenantId, eid],
  );

  const handleOpenQueryActivityModal = () => {
    setIsQueryActivityModalOpen(true);
  };

  const handleCreateQueryActivity = useCallback(
    async (draft: QueryActivityDraft) => {
      try {
        const result = await createQueryActivityMutation.mutateAsync({
          name: draft.name,
          customerKey: draft.externalKey,
          description: draft.description,
          categoryId: draft.categoryId,
          targetDataExtensionCustomerKey: draft.targetDataExtensionCustomerKey,
          queryText: draft.queryText,
          targetUpdateType: draft.targetUpdateType,
        });

        // Invalidate Query Activity folders cache to refresh the sidebar
        await queryClient.invalidateQueries({
          queryKey: queryActivityFoldersQueryKeys.all,
        });

        // Auto-link if this is a saved query tab
        const savedQueryId = safeActiveTab.queryId;
        if (savedQueryId && result.customerKey) {
          try {
            const linkResponse = await linkMutation.mutateAsync({
              savedQueryId,
              qaCustomerKey: result.customerKey,
            });
            if (activeTabId) {
              storeUpdateTabLinkState(activeTabId, {
                linkedQaCustomerKey: linkResponse.linkedQaCustomerKey,
                linkedQaName: linkResponse.linkedQaName,
              });
            }
            toast.success(`Query Activity "${draft.name}" deployed and linked`);
          } catch {
            toast.success(`Query Activity "${draft.name}" deployed`, {
              description: `Object ID: ${result.objectId}`,
            });
          }
        } else {
          toast.success(`Query Activity "${draft.name}" deployed`, {
            description: `Object ID: ${result.objectId}`,
          });
        }
        setIsQueryActivityModalOpen(false);
      } catch (error) {
        // Extract detailed error message from API response (RFC 9457 Problem Details format)
        let description = "An error occurred";
        if (axios.isAxiosError(error)) {
          const detail = error.response?.data?.detail;
          description = typeof detail === "string" ? detail : error.message;
        } else if (error instanceof Error) {
          description = error.message;
        }
        toast.error("Failed to deploy Query Activity", { description });
        // Keep modal open on error - do not close or rethrow
      }
    },
    [
      createQueryActivityMutation,
      queryClient,
      safeActiveTab.queryId,
      activeTabId,
      linkMutation,
      storeUpdateTabLinkState,
    ],
  );

  const handleOpenLinkModal = useCallback((queryId: string) => {
    setLinkTargetQueryId(queryId);
    setIsLinkModalOpen(true);
  }, []);

  const handleLinkComplete = useCallback(
    (linkResponse: LinkQueryResponse) => {
      setIsLinkModalOpen(false);
      setLinkTargetQueryId(null);

      // Update tab link state if the linked query is open
      const linkedQueryId = linkTargetQueryId ?? safeActiveTab.queryId;
      if (linkedQueryId) {
        const tab = storeFindTabByQueryId(linkedQueryId);
        if (tab) {
          storeUpdateTabLinkState(tab.id, {
            linkedQaCustomerKey: linkResponse.linkedQaCustomerKey,
            linkedQaName: linkResponse.linkedQaName,
          });
        }
      }
    },
    [
      linkTargetQueryId,
      safeActiveTab.queryId,
      storeFindTabByQueryId,
      storeUpdateTabLinkState,
    ],
  );

  const handleLinkCreateNew = useCallback(() => {
    setIsLinkModalOpen(false);
    setLinkTargetQueryId(null);
    setIsQueryActivityModalOpen(true);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      storeCloseTab(id);
      onTabClose?.(id);
      setTabToClose(null);
    },
    [storeCloseTab, onTabClose],
  );

  const handleEditorChange = useCallback(
    (content: string) => {
      if (activeTabId) {
        storeUpdateTabContent(activeTabId, content);
      }
    },
    [activeTabId, storeUpdateTabContent],
  );

  const handleRunRequest = useCallback(() => {
    if (isRunning) {
      return;
    }
    if (hasBlockingDiagnostics) {
      setIsRunBlockedOpen(true);
      return;
    }
    if (isAtRunLimit) {
      setIsUpgradeModalOpen(true);
      return;
    }
    void execute(
      safeActiveTab.content,
      safeActiveTab.name,
      undefined,
      undefined,
      safeActiveTab.queryId ?? undefined,
    );
  }, [
    isRunning,
    hasBlockingDiagnostics,
    isAtRunLimit,
    execute,
    safeActiveTab.content,
    safeActiveTab.name,
    safeActiveTab.queryId,
  ]);

  const handleCancel = useCallback(() => {
    void cancel();
  }, [cancel]);

  const handleHistoryRerun = useCallback(
    (sql: string, queryName: string, createdAt: string) => {
      const dateStr = new Date(createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const tabName = `Copy of ${queryName} (${dateStr} run)`;

      const newTabId = storeCreateNewTab();
      storeUpdateTabContent(newTabId, sql);
      storeSetActiveTab(newTabId);
      setActiveView(null);
      onTabChange?.(newTabId);

      toast.success(`Opened "${tabName}" in a new tab`, {
        description: "Review and edit before running.",
      });
    },
    [
      onTabChange,
      setActiveView,
      storeCreateNewTab,
      storeSetActiveTab,
      storeUpdateTabContent,
    ],
  );

  const handleHistoryCopySql = useCallback((sql: string) => {
    void copyToClipboard(sql).then((didCopy) => {
      if (didCopy) {
        toast.success("SQL copied to clipboard");
      } else {
        toast.error("Unable to copy SQL");
      }
    });
  }, []);

  const handleViewQueryHistory = useCallback(
    (queryId: string) => {
      showHistoryForQuery(queryId);
    },
    [showHistoryForQuery],
  );

  const handleRunToTarget = useCallback(() => {
    setIsTargetDEModalOpen(true);
  }, []);

  const handleSelectTargetDE = useCallback(
    (customerKey: string, targetUpdateType: TargetUpdateType) => {
      void execute(
        safeActiveTab.content,
        safeActiveTab.name,
        customerKey,
        targetUpdateType,
        safeActiveTab.queryId ?? undefined,
      );
      setIsTargetDEModalOpen(false);
    },
    [execute, safeActiveTab.content, safeActiveTab.name, safeActiveTab.queryId],
  );

  const isIdle = executionResult.status === "idle";
  const shouldShowResultsPane = !isIdle || isResultsOpen;

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="flex flex-1 bg-background text-foreground font-sans h-full">
        {/* Activity Bar */}
        <ActivityBar />

        {activeView === "history" ? (
          <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
            <HistoryPanel
              queryIdFilter={historyQueryIdFilter}
              onRerun={handleHistoryRerun}
              onCopySql={handleHistoryCopySql}
              onUpgradeClick={() => setIsUpgradeModalOpen(true)}
            />
          </div>
        ) : (
          <>
            {/* Sidebar Panel */}
            {activeView !== null ? (
              <WorkspaceSidebar
                activeView={activeView}
                tenantId={tenantId}
                folders={folders}
                savedQueries={savedQueries}
                dataExtensions={dataExtensions}
                isDataExtensionsFetching={isDataExtensionsFetching}
                onSelectQuery={(id) => {
                  // Check if already open in Zustand store
                  const existingTab = tabs.find((t) => t.queryId === id);
                  if (existingTab) {
                    storeSetActiveTab(existingTab.id);
                    onTabChange?.(existingTab.id);
                    return;
                  }
                  // Trigger lazy fetch
                  requestOpenSavedQuery(id);
                  onSelectQuery?.(id);
                }}
                onSelectDE={onSelectDE}
                onCreateDE={handleCreateDE}
                onViewQueryHistory={handleViewQueryHistory}
                onViewVersionHistory={(queryId) =>
                  handleOpenVersionHistory(queryId)
                }
                onLinkQuery={
                  isDeployFeatureEnabled ? handleOpenLinkModal : undefined
                }
                onUnlinkQuery={
                  isDeployFeatureEnabled ? handleOpenUnlinkModal : undefined
                }
              />
            ) : null}

            {/* Main IDE Workspace */}
            <div ref={workspaceRef} className="flex-1 flex flex-col min-w-0">
              {versionHistoryIsOpen && versionHistorySavedQueryId ? (
                <VersionHistoryPanel
                  savedQueryId={versionHistorySavedQueryId}
                  queryName={
                    storeFindTabByQueryId(versionHistorySavedQueryId)?.name ??
                    safeActiveTab.name
                  }
                  onClose={closeVersionHistory}
                  onRestore={handleVersionRestore}
                  onUpgradeClick={() => setIsUpgradeModalOpen(true)}
                  onPublishVersion={
                    isDeployFeatureEnabled && safeActiveTab.linkedQaCustomerKey
                      ? handleVersionPublish
                      : undefined
                  }
                  isLinked={!!safeActiveTab.linkedQaCustomerKey}
                />
              ) : (
                <>
                  <EditorToolbar
                    activeTab={safeActiveTab}
                    runButton={{
                      onRun: handleRunRequest,
                      onRunToTarget: handleRunToTarget,
                      isRunning,
                      disabled: hasBlockingDiagnostics,
                      tooltipMessage: runTooltipMessage,
                    }}
                    onSave={() => void handleSave()}
                    onFormat={onFormat}
                    onCreateDE={handleCreateDE}
                    onOpenImport={() => setIsImportModalOpen(true)}
                    isDeployFeatureEnabled={isDeployFeatureEnabled}
                    onViewRunHistory={(queryId) => showHistoryForQuery(queryId)}
                    onOpenVersionHistory={() => handleOpenVersionHistory()}
                    onPublish={() => void handlePublishClick()}
                    isPublishing={publishMutation.isPending}
                    automationCount={
                      toolbarBlastRadius.data?.totalCount ?? null
                    }
                    onUnlink={(queryId) => handleOpenUnlinkModal(queryId)}
                    onLink={(queryId) => handleOpenLinkModal(queryId)}
                    onCreateInAS={handleOpenQueryActivityModal}
                  />

                  {/* Usage Warning Banner */}
                  {tier === "free" &&
                  isNearRunLimit &&
                  usageData?.queryRuns.limit ? (
                    <UsageWarningBanner
                      resourceName="query runs"
                      current={usageData.queryRuns.current}
                      limit={usageData.queryRuns.limit}
                      resetDate={usageData.queryRuns.resetDate}
                    />
                  ) : null}

                  {/* Editor & Results Pane Split */}
                  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                    {/* Editor Area with Vertical Tabs */}
                    <div className="flex-1 flex min-h-0">
                      {/* Monaco Editor Pane */}
                      <div className="flex-1 relative bg-background/50 font-mono">
                        <MonacoQueryEditor
                          value={safeActiveTab.content}
                          onChange={handleEditorChange}
                          onSave={handleSave}
                          onSaveAs={handleSaveAs}
                          onRunRequest={handleRunRequest}
                          onCursorPositionChange={setCursorPosition}
                          diagnostics={sqlDiagnostics}
                          dataExtensions={dataExtensions}
                          folders={folders}
                          tenantId={tenantId}
                          className="h-full"
                        />
                      </div>

                      {/* Vertical Tabs Sidebar (Right Side) */}
                      <QueryTabBar
                        onSaveTab={(tabId) => {
                          const tab = tabs.find((t) => t.id === tabId);
                          if (tab?.isNew) {
                            openSaveModal();
                          } else if (tab) {
                            // Mark as saved in store
                            if (tab.queryId) {
                              storeMarkTabSaved(tabId, tab.queryId, tab.name);
                            }
                            onSave?.(tab.id, tab.content);
                          }
                        }}
                        onCloseWithConfirm={(tabId) => {
                          setTabToClose(tabId);
                          setIsConfirmCloseOpen(true);
                        }}
                      />
                    </div>

                    <EditorResultsPane
                      shouldShowResultsPane={shouldShowResultsPane}
                      resultsHeight={resultsHeight}
                      isResizingResults={isResizingResults}
                      onResizeStart={handleResultsResizeStart}
                      onToggle={toggleResultsPane}
                      result={executionResult}
                      onPageChange={(page) => {
                        setPage(page);
                        onPageChange?.(page);
                      }}
                      onCancel={handleCancel}
                      onViewInContactBuilder={onViewInContactBuilder}
                    />
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <EditorWorkspaceModals
          tenantId={tenantId}
          eid={eid}
          folders={folders}
          qaFolders={qaFolders}
          dataExtensions={dataExtensions}
          queryClient={queryClient}
          dataExtensionModal={{
            isOpen: isDEModalOpen,
            onClose: () => {
              setIsDEModalOpen(false);
              setInferredFields([]);
            },
            initialFields: inferredFields,
            onSave: handleSaveDataExtension,
          }}
          queryActivityModal={{
            isOpen: isQueryActivityModalOpen,
            initialName: safeActiveTab.name,
            isPending: createQueryActivityMutation.isPending,
            onClose: () => setIsQueryActivityModalOpen(false),
            onSubmit: handleCreateQueryActivity,
            queryText: safeActiveTab.content,
          }}
          linkQueryModal={{
            isOpen: isLinkModalOpen,
            linkTargetInfo,
            onClose: () => {
              setIsLinkModalOpen(false);
              setLinkTargetQueryId(null);
            },
            onLinkComplete: handleLinkComplete,
            onCreateNew: handleLinkCreateNew,
          }}
          importQueryModal={{
            isOpen: isImportModalOpen,
            onClose: () => setIsImportModalOpen(false),
            onImportSaved: (queryId, name, sqlText) => {
              storeOpenQuery(queryId, name, sqlText);
              setIsImportModalOpen(false);
            },
            onOpenInEditor: (sqlText, qaName) => {
              const tabId = storeCreateNewTab();
              storeUpdateTabContent(tabId, sqlText);
              setIsImportModalOpen(false);
              toast.success(`Opened "${qaName}" in editor`);
            },
          }}
          publishDialog={{
            isOpen: showPublishConfirm,
            onClose: closePublishConfirm,
            onConfirm: () => void handlePublishConfirm(),
            isPending: publishMutation.isPending,
            qaName: safeActiveTab.linkedQaName ?? "Query Activity",
            currentAsSql: driftCheck.data?.remoteSql ?? null,
            versionSql: safeActiveTab.content,
            automations: blastRadius.data?.automations ?? [],
            isLoadingBlastRadius: blastRadius.isLoading,
            blastRadiusError: blastRadius.isError,
          }}
          unlinkModal={{
            target: unlinkTarget,
            onClose: closeUnlinkModal,
            onUnlinkComplete: handleUnlinkComplete,
          }}
          driftDialog={{
            isOpen: showDriftDialog,
            onClose: closeDriftDialog,
            localSql: driftCheck.data?.localSql ?? safeActiveTab.content,
            remoteSql: driftCheck.data?.remoteSql ?? "",
            qaName: safeActiveTab.linkedQaName ?? "Query Activity",
            onKeepMine: handleDriftKeepMine,
            onAcceptTheirs: () => void handleDriftAcceptTheirs(),
            isPending: updateQuery.isPending ?? false,
          }}
          targetDataExtensionModal={{
            isOpen: isTargetDEModalOpen,
            onClose: () => setIsTargetDEModalOpen(false),
            sqlText: safeActiveTab.content,
            onSelect: handleSelectTargetDE,
          }}
          saveQueryModal={{
            isOpen: isSaveModalOpen,
            content: safeActiveTab.content,
            initialName: saveModalInitialName,
            onClose: closeSaveModal,
            onSaveSuccess: handleSaveModalSuccess,
          }}
        />

        <ConfirmationDialog
          isOpen={isRunBlockedOpen}
          title="Query can't run yet"
          description={runBlockMessage ?? "Query is missing required SQL."}
          confirmLabel="OK"
          cancelLabel="Close"
          variant="warning"
          onClose={() => setIsRunBlockedOpen(false)}
          onConfirm={() => {}}
        />

        <ConfirmationDialog
          isOpen={isConfirmCloseOpen}
          title="Unsaved Changes"
          description="You have unsaved changes in this tab. Closing it will discard these changes forever. Are you sure?"
          confirmLabel="Close Anyway"
          variant="danger"
          onClose={() => {
            setIsConfirmCloseOpen(false);
            setTabToClose(null);
          }}
          onConfirm={() => {
            if (tabToClose) {
              handleCloseTab(tabToClose);
            }
          }}
        />

        <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
        />

        <VersionHistoryWarningDialog
          open={isVersionHistoryWarningOpen}
          onCancel={handleVersionHistoryWarningCancel}
          onContinueWithoutSaving={handleVersionHistoryContinueWithoutSaving}
          onSaveAndContinue={() => void handleVersionHistorySaveAndContinue()}
        />
      </div>
    </Tooltip.Provider>
  );
}
