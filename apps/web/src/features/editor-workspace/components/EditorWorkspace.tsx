import type { CreateDataExtensionDto } from "@qpp/shared-types";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AltArrowUp,
  Code,
  Database,
  Diskette,
  Download,
  MenuDots,
  Play,
  Rocket,
} from "@solar-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { FeatureGate } from "@/components/FeatureGate";
import { metadataQueryKeys } from "@/features/editor-workspace/hooks/use-metadata";
import { useQueryExecution } from "@/features/editor-workspace/hooks/use-query-execution";
import {
  useSavedQuery,
  useUpdateSavedQuery,
} from "@/features/editor-workspace/hooks/use-saved-queries";
import type {
  DataExtensionField,
  EditorWorkspaceProps,
  ExecutionResult,
} from "@/features/editor-workspace/types";
import { formatDiagnosticMessage } from "@/features/editor-workspace/utils/sql-diagnostics";
import {
  getFirstBlockingDiagnostic,
  hasBlockingDiagnostics as checkHasBlockingDiagnostics,
} from "@/features/editor-workspace/utils/sql-lint";
import { useSqlDiagnostics } from "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics";
import { cn } from "@/lib/utils";
import { createDataExtension } from "@/services/metadata";
import { useTabsStore } from "@/store/tabs-store";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { DataExtensionModal } from "./DataExtensionModal";
import { MonacoQueryEditor } from "./MonacoQueryEditor";
import { QueryActivityModal } from "./QueryActivityModal";
import { QueryTabBar } from "./QueryTabBar";
import { ResultsPane } from "./ResultsPane";
import { SaveQueryModal } from "./SaveQueryModal";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

export function EditorWorkspace({
  tenantId,
  eid,
  folders,
  savedQueries,
  dataExtensions,
  executionResult: externalExecutionResult,
  initialTabs,
  isSidebarCollapsed: initialSidebarCollapsed,
  isDataExtensionsFetching = false,
  guardrailMessage: _guardrailMessageProp,
  guardrailTitle: _guardrailTitleProp = "Guardrail Violation",
  onSave,
  onSaveAs: _onSaveAs,
  onFormat,
  onDeploy,
  onCreateQueryActivity,
  onSelectQuery,
  onSelectDE,
  onToggleSidebar,
  onPageChange,
  onViewInContactBuilder,
  onCreateDE,
  onTabClose,
  onTabChange,
  onNewTab: _onNewTab,
}: EditorWorkspaceProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    initialSidebarCollapsed,
  );
  const [isDEModalOpen, setIsDEModalOpen] = useState(false);
  const [isQueryActivityModalOpen, setIsQueryActivityModalOpen] =
    useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const [tabToClose, setTabToClose] = useState<string | null>(null);
  const [isRunBlockedOpen, setIsRunBlockedOpen] = useState(false);
  const [inferredFields, setInferredFields] = useState<DataExtensionField[]>(
    [],
  );

  // TanStack Query client for metadata fetching
  const queryClient = useQueryClient();

  // State for lazy-loading query content when opening from sidebar
  const [pendingQueryId, setPendingQueryId] = useState<string | null>(null);

  // State for Save As mode
  const [isSaveAsMode, setIsSaveAsMode] = useState(false);
  const [saveAsInitialName, setSaveAsInitialName] = useState<string>("");

  // Lazy fetch query content when opening from sidebar
  const { data: pendingQuery } = useSavedQuery(pendingQueryId ?? undefined);

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

  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [resultsHeight, setResultsHeight] = useState(280);
  const [isResizingResults, setIsResizingResults] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number | undefined>(
    undefined,
  );
  const workspaceRef = useRef<HTMLDivElement>(null);

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

  const runBlockMessage = useMemo(() => {
    if (!blockingDiagnostic) {
      return null;
    }
    return formatDiagnosticMessage(blockingDiagnostic, safeActiveTab.content);
  }, [safeActiveTab.content, blockingDiagnostic]);

  const runTooltipMessage = useMemo(() => {
    if (isRunning) {
      return "Query is currently running...";
    }
    if (hasBlockingDiagnostics) {
      return runBlockMessage ?? "Query is missing required SQL.";
    }
    return "Execute SQL (Ctrl+Enter)";
  }, [isRunning, hasBlockingDiagnostics, runBlockMessage]);

  const executionResult: ExecutionResult = useMemo(() => {
    const legacyStatus =
      executionStatus === "ready"
        ? "success"
        : executionStatus === "failed" || executionStatus === "canceled"
          ? "error"
          : executionStatus === "idle"
            ? "idle"
            : "running";

    const resultsData = results.data;

    return {
      ...externalExecutionResult,
      status: legacyStatus,
      executionStatus,
      runId: runId ?? undefined,
      errorMessage:
        executionErrorMessage ??
        results.error?.message ??
        externalExecutionResult.errorMessage,
      columns: resultsData?.columns ?? externalExecutionResult.columns,
      rows: (resultsData?.rows ?? externalExecutionResult.rows) as Record<
        string,
        string | number | boolean | null
      >[],
      totalRows: resultsData?.totalRows ?? externalExecutionResult.totalRows,
      currentPage: resultsData?.page ?? currentPage,
      pageSize: resultsData?.pageSize ?? externalExecutionResult.pageSize,
    };
  }, [
    externalExecutionResult,
    executionStatus,
    runId,
    executionErrorMessage,
    results.data,
    results.error,
    currentPage,
  ]);

  // Effect to open tab when pending query loads
  useEffect(() => {
    if (pendingQuery && pendingQueryId) {
      storeOpenQuery(pendingQuery.id, pendingQuery.name, pendingQuery.sqlText);
      setPendingQueryId(null);
    }
  }, [pendingQuery, pendingQueryId, storeOpenQuery]);

  // Dirty State & BeforeUnload
  useEffect(() => {
    const hasDirtyTabs = tabs.some((t) => t.isDirty);
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyTabs) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [tabs]);

  useEffect(() => {
    if (executionResult.status !== "idle") {
      setIsResultsOpen(true);
    }
  }, [executionResult.status]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
    onToggleSidebar?.();
  };

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
    async (draft: {
      name: string;
      customerKey: string;
      folderId: string;
      isSendable: boolean;
      subscriberKeyField?: string;
      fields: DataExtensionField[];
    }) => {
      // Map DataExtensionDraft to CreateDataExtensionDto (strip client-side id from fields)
      const dto: CreateDataExtensionDto = {
        name: draft.name,
        customerKey: draft.customerKey,
        folderId: draft.folderId,
        isSendable: draft.isSendable,
        subscriberKeyField: draft.subscriberKeyField,
        fields: draft.fields.map(({ id: _id, ...field }) => field),
      };

      try {
        await createDataExtension(dto);
        toast.success(`Data Extension "${draft.name}" created`);
        // Refresh data extensions list
        await queryClient.invalidateQueries({
          queryKey: metadataQueryKeys.dataExtensions(tenantId, eid),
        });
      } catch (error) {
        toast.error("Failed to create Data Extension", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
      }
    },
    [queryClient, tenantId, eid],
  );

  const handleOpenQueryActivityModal = () => {
    setIsQueryActivityModalOpen(true);
  };

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

  const handleSave = useCallback(async () => {
    if (!safeActiveTab.queryId) {
      setIsSaveModalOpen(true);
    } else if (safeActiveTab.isDirty) {
      // Auto-save existing query via API
      try {
        await updateQuery.mutateAsync({
          id: safeActiveTab.queryId,
          data: { sqlText: safeActiveTab.content },
        });

        // Mark tab as saved in Zustand store
        if (activeTabId) {
          storeMarkTabSaved(
            activeTabId,
            safeActiveTab.queryId,
            safeActiveTab.name,
          );
        }

        toast.success("Query saved");
        onSave?.(safeActiveTab.id, safeActiveTab.content);
      } catch (error) {
        toast.error("Failed to save query", {
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
      }
    }
  }, [safeActiveTab, activeTabId, storeMarkTabSaved, updateQuery, onSave]);

  const handleSaveAs = useCallback(() => {
    const name = safeActiveTab?.name || "Untitled";
    setSaveAsInitialName(`${name} (copy)`);
    setIsSaveAsMode(true);
    setIsSaveModalOpen(true);
  }, [safeActiveTab?.name]);

  const handleSaveAsSuccess = useCallback(
    (queryId: string, name: string) => {
      // Create new tab for the copy (Google Docs style - original tab stays open)
      storeOpenQuery(queryId, name, safeActiveTab?.content ?? "");
      setIsSaveModalOpen(false);
      setIsSaveAsMode(false);
      setSaveAsInitialName("");
    },
    [safeActiveTab?.content, storeOpenQuery],
  );

  const handleResultsToggle = () => {
    setIsResultsOpen((prev) => !prev);
  };

  const handleRunRequest = useCallback(() => {
    if (isRunning) {
      return;
    }
    if (hasBlockingDiagnostics) {
      setIsRunBlockedOpen(true);
      return;
    }
    void execute(safeActiveTab.content, safeActiveTab.name);
  }, [
    isRunning,
    hasBlockingDiagnostics,
    execute,
    safeActiveTab.content,
    safeActiveTab.name,
  ]);

  const handleCancel = useCallback(() => {
    void cancel();
  }, [cancel]);

  const handleResultsResizeStart = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!workspaceRef.current) {
      return;
    }
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = resultsHeight;
    const containerHeight = workspaceRef.current.clientHeight;
    const minHeight = 160;
    const maxHeight = Math.max(minHeight, Math.min(560, containerHeight - 120));

    setIsResizingResults(true);

    const handleMove = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientY - startY;
      const nextHeight = Math.min(
        maxHeight,
        Math.max(minHeight, startHeight - delta),
      );
      setResultsHeight(nextHeight);
    };

    const handleUp = () => {
      setIsResizingResults(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const isIdle = executionResult.status === "idle";
  const shouldShowResultsPane = !isIdle || isResultsOpen;
  const isRunDisabled = hasBlockingDiagnostics || isRunning;

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="flex flex-1 bg-background text-foreground font-sans h-full">
        {/* Sidebar Explorer */}
        <WorkspaceSidebar
          tenantId={tenantId}
          folders={folders}
          savedQueries={savedQueries}
          dataExtensions={dataExtensions}
          isCollapsed={isSidebarCollapsed}
          isDataExtensionsFetching={isDataExtensionsFetching}
          onToggle={handleToggleSidebar}
          onSelectQuery={(id) => {
            // Check if already open in Zustand store
            const existingTab = tabs.find((t) => t.queryId === id);
            if (existingTab) {
              storeSetActiveTab(existingTab.id);
              onTabChange?.(existingTab.id);
              return;
            }
            // Trigger lazy fetch
            setPendingQueryId(id);
            onSelectQuery?.(id);
          }}
          onSelectDE={onSelectDE}
          onCreateDE={handleCreateDE}
        />

        {/* Main IDE Workspace */}
        <div ref={workspaceRef} className="flex-1 flex flex-col min-w-0">
          {/* Workspace Header / Toolbar */}
          <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0 overflow-visible">
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <span
                      className={cn(
                        "inline-flex",
                        isRunDisabled && "cursor-not-allowed",
                      )}
                    >
                      <button
                        onClick={handleRunRequest}
                        disabled={isRunDisabled}
                        data-testid="run-button"
                        className={cn(
                          "flex items-center gap-2 bg-success text-success-foreground h-8 px-4 rounded-l-md text-xs font-bold transition-all shadow-lg shadow-success/20 active:scale-95",
                          isRunDisabled
                            ? "opacity-60 cursor-not-allowed shadow-none"
                            : "hover:brightness-110",
                        )}
                      >
                        {isRunning ? (
                          <span
                            className="h-4 w-4 animate-spin rounded-full border-2 border-success-foreground border-t-transparent"
                            data-testid="run-spinner"
                          />
                        ) : (
                          <Play size={16} weight="Bold" />
                        )}
                        RUN
                      </button>
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
                      sideOffset={5}
                    >
                      {runTooltipMessage}
                      <Tooltip.Arrow className="fill-foreground" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>

                <button
                  className={cn(
                    "h-8 px-2 bg-success brightness-90 text-success-foreground border-l border-black/10 rounded-r-md active:scale-95",
                    isRunDisabled
                      ? "opacity-60 cursor-not-allowed"
                      : "hover:brightness-100",
                  )}
                  disabled={isRunDisabled}
                >
                  <MenuDots size={14} weight="Bold" />
                </button>
              </div>

              <div className="h-4 w-px bg-border mx-1" />

              <div className="flex items-center gap-1 overflow-visible">
                <ToolbarButton
                  icon={<Diskette size={18} />}
                  label={safeActiveTab.isDirty ? "Save Changes*" : "Save Query"}
                  onClick={handleSave}
                  className={safeActiveTab.isDirty ? "text-primary" : ""}
                />
                <ToolbarButton
                  icon={<Code size={18} />}
                  label="Format SQL"
                  onClick={onFormat}
                />
                <ToolbarButton
                  icon={<Download size={18} />}
                  label="Export Results"
                />
                <div className="h-4 w-px bg-border mx-1" />
                <FeatureGate feature="createDataExtension" variant="button">
                  <ToolbarButton
                    icon={<Database size={18} />}
                    label="Create Data Extension"
                    onClick={handleCreateDE}
                    className="text-primary hover:text-primary-foreground hover:bg-primary"
                  />
                </FeatureGate>
              </div>
            </div>

            <div className="flex items-center gap-3 overflow-visible">
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Active Tab
                </span>
                <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                  {safeActiveTab.name}
                  {safeActiveTab.isDirty ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  ) : null}
                </span>
              </div>
              <FeatureGate feature="deployToAutomation" variant="button">
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button
                      onClick={handleOpenQueryActivityModal}
                      className="flex items-center gap-2 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground h-8 px-4 rounded-md text-xs font-bold transition-all group active:scale-95"
                    >
                      <Rocket
                        size={16}
                        weight="Bold"
                        className="group-hover:animate-bounce"
                      />
                      Deploy to Automation
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
                      sideOffset={5}
                    >
                      Create permanent MCE Activity
                      <Tooltip.Arrow className="fill-foreground" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </FeatureGate>
            </div>
          </div>

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
                    setIsSaveModalOpen(true);
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

            {/* Results Resizable Pane */}
            <div
              className={cn(
                "border-t border-border bg-background flex flex-col min-h-[32px]",
                isResizingResults
                  ? "transition-none"
                  : "transition-[height] duration-300 ease-out",
              )}
              style={{ height: shouldShowResultsPane ? resultsHeight : 32 }}
            >
              {shouldShowResultsPane ? (
                <>
                  <div
                    onPointerDown={handleResultsResizeStart}
                    className="h-2 cursor-row-resize bg-border/40 hover:bg-border transition-colors"
                  >
                    <div className="mx-auto mt-0.5 h-1 w-10 rounded-full bg-muted-foreground/30" />
                  </div>
                  <div className="flex-1 min-h-0">
                    <ResultsPane
                      result={executionResult}
                      onPageChange={(page) => {
                        setPage(page);
                        onPageChange?.(page);
                      }}
                      onCancel={handleCancel}
                      onViewInContactBuilder={() => {
                        const subscriberKey =
                          executionResult.rows[0]?.SubscriberKey;
                        if (typeof subscriberKey === "string") {
                          onViewInContactBuilder?.(subscriberKey);
                        }
                      }}
                    />
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleResultsToggle}
                  className="h-full w-full flex items-center justify-between px-4 bg-card/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span>Run a query to see results</span>
                  <AltArrowUp size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Modals */}
        <DataExtensionModal
          isOpen={isDEModalOpen}
          onClose={() => {
            setIsDEModalOpen(false);
            setInferredFields([]);
          }}
          onSave={handleSaveDataExtension}
          initialFields={inferredFields}
          folders={folders.filter((f) => f.type === "data-extension")}
        />

        <QueryActivityModal
          isOpen={isQueryActivityModalOpen}
          dataExtensions={dataExtensions}
          initialName={safeActiveTab.name}
          onClose={() => setIsQueryActivityModalOpen(false)}
          onCreate={(draft) => {
            onCreateQueryActivity?.(draft);
            onDeploy?.(safeActiveTab.queryId ?? safeActiveTab.id);
          }}
        />

        <SaveQueryModal
          isOpen={isSaveModalOpen}
          content={safeActiveTab.content}
          initialName={isSaveAsMode ? saveAsInitialName : safeActiveTab.name}
          onClose={() => {
            setIsSaveModalOpen(false);
            setIsSaveAsMode(false);
            setSaveAsInitialName("");
          }}
          onSaveSuccess={
            isSaveAsMode
              ? handleSaveAsSuccess
              : (queryId, name) => {
                  // Mark tab as saved in Zustand store
                  if (activeTabId) {
                    storeMarkTabSaved(activeTabId, queryId, name);
                  }
                }
          }
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
      </div>
    </Tooltip.Provider>
  );
}

interface ToolbarButtonProps {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  className?: string;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  className,
}: ToolbarButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all active:scale-95",
            className,
          )}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 font-bold uppercase tracking-tight"
          sideOffset={5}
          collisionPadding={10}
        >
          {label}
          <Tooltip.Arrow className="fill-foreground" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
