import * as Tooltip from "@radix-ui/react-tooltip";
import {
  AddCircle,
  AltArrowLeft,
  AltArrowRight,
  AltArrowUp,
  CloseCircle,
  Code,
  Database,
  Diskette,
  Download,
  FileText,
  MenuDots,
  Play,
  Rocket,
} from "@solar-icons/react";
import {
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { FeatureGate } from "@/components/FeatureGate";
import { useQueryExecution } from "@/features/editor-workspace/hooks/use-query-execution";
import type {
  EditorWorkspaceProps,
  ExecutionResult,
  QueryTab,
} from "@/features/editor-workspace/types";
import { formatDiagnosticMessage } from "@/features/editor-workspace/utils/sql-diagnostics";
import {
  getFirstBlockingDiagnostic,
  hasBlockingDiagnostics as checkHasBlockingDiagnostics,
} from "@/features/editor-workspace/utils/sql-lint";
import { useSqlDiagnostics } from "@/features/editor-workspace/utils/sql-lint/use-sql-diagnostics";
import { cn } from "@/lib/utils";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { DataExtensionModal } from "./DataExtensionModal";
import { MonacoQueryEditor } from "./MonacoQueryEditor";
import { QueryActivityModal } from "./QueryActivityModal";
import { ResultsPane } from "./ResultsPane";
import { SaveQueryModal } from "./SaveQueryModal";
import { WorkspaceSidebar } from "./WorkspaceSidebar";

const createDefaultTab = (): QueryTab => ({
  id: `t-${Date.now()}`,
  name: "New Query",
  content: "",
  isDirty: false,
  isNew: true,
});

export function EditorWorkspace({
  tenantId,
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
  onSaveAs,
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
  onNewTab,
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
  } = useQueryExecution({ tenantId });

  // Tab Management - ensure tabs array is never empty
  const [{ tabs, activeTabId }, setTabState] = useState(() => {
    const initial = initialTabs ?? [];
    const firstInitialTab = initial[0];
    if (firstInitialTab) {
      return { tabs: initial, activeTabId: firstInitialTab.id };
    }
    const defaultTab = createDefaultTab();
    return { tabs: [defaultTab], activeTabId: defaultTab.id };
  });
  const setActiveTabId = useCallback((id: string) => {
    setTabState((prev) => ({ ...prev, activeTabId: id }));
  }, []);
  const [isTabRailExpanded, setIsTabRailExpanded] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [resultsHeight, setResultsHeight] = useState(280);
  const [isResizingResults, setIsResizingResults] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number | undefined>(
    undefined,
  );
  const workspaceRef = useRef<HTMLDivElement>(null);

  const safeSetTabs = useCallback(
    (updater: QueryTab[] | ((prev: QueryTab[]) => QueryTab[])) => {
      setTabState((prev) => {
        const next =
          typeof updater === "function" ? updater(prev.tabs) : updater;
        if (next.length > 0) {
          return { ...prev, tabs: next };
        }
        const defaultTab = createDefaultTab();
        return { tabs: [defaultTab], activeTabId: defaultTab.id };
      });
    },
    [],
  );

  const activeTab = useMemo(() => {
    const found = tabs.find((t) => t.id === activeTabId);
    if (found) {
      return found;
    }
    const first = tabs[0];
    if (!first) {
      throw new Error("Invariant violated: tabs array should never be empty");
    }
    return first;
  }, [tabs, activeTabId]);

  // Use the new hook that merges sync (legacy/prereq) and async (AST worker) diagnostics
  const sqlDiagnostics = useSqlDiagnostics(activeTab.content, {
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
    return formatDiagnosticMessage(blockingDiagnostic, activeTab.content);
  }, [activeTab.content, blockingDiagnostic]);

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

  const handleCreateDE = () => {
    setIsDEModalOpen(true);
    onCreateDE?.();
  };

  const handleOpenQueryActivityModal = () => {
    setIsQueryActivityModalOpen(true);
  };

  const handleNewTab = () => {
    const newId = `t-${Date.now()}`;
    const newTab: QueryTab = {
      id: newId,
      name: "Untitled Query",
      content: "",
      isDirty: false,
      isNew: true,
    };
    safeSetTabs([...tabs, newTab]);
    setActiveTabId(newId);
    onNewTab?.();
  };

  const handleTabChange = (id: string) => {
    setActiveTabId(id);
    onTabChange?.(id);
  };

  const handleRequestCloseTab = (
    e: MouseEvent<HTMLButtonElement>,
    id: string,
  ) => {
    e.stopPropagation();
    const tab = tabs.find((t) => t.id === id);
    if (tab?.isDirty) {
      setTabToClose(id);
      setIsConfirmCloseOpen(true);
    } else {
      handleCloseTab(id);
    }
  };

  const handleCloseTab = (id: string) => {
    const newTabs = tabs.filter((t) => t.id !== id);
    safeSetTabs(newTabs);
    if (activeTabId === id) {
      const fallbackTab = newTabs[newTabs.length - 1];
      if (fallbackTab) {
        setActiveTabId(fallbackTab.id);
      }
    }
    onTabClose?.(id);
    setTabToClose(null);
  };

  const handleEditorChange = (content: string) => {
    safeSetTabs(
      tabs.map((t) =>
        t.id === activeTabId ? { ...t, content, isDirty: true } : t,
      ),
    );
  };

  const handleSave = () => {
    if (activeTab.isNew) {
      setIsSaveModalOpen(true);
    } else {
      safeSetTabs(
        tabs.map((t) => (t.id === activeTabId ? { ...t, isDirty: false } : t)),
      );
      onSave?.(activeTab.id, activeTab.content);
    }
  };

  const handleFinalSave = (name: string, folderId: string) => {
    safeSetTabs(
      tabs.map((t) =>
        t.id === activeTabId ? { ...t, name, isDirty: false, isNew: false } : t,
      ),
    );
    onSaveAs?.(activeTab.id, name, folderId);
    setIsSaveModalOpen(false);
  };

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
    void execute(activeTab.content, activeTab.name);
  }, [
    isRunning,
    hasBlockingDiagnostics,
    execute,
    activeTab.content,
    activeTab.name,
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

  // Listen for sidebar selection to open in new tab or existing
  useEffect(() => {
    // This is a mock implementation as the selection usually comes from the sidebar component
    // In a real app, onSelectQuery would trigger this
  }, []);

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
            const query = savedQueries.find((q) => q.id === id);
            if (query) {
              const existingTab = tabs.find((t) => t.queryId === id);
              if (existingTab) {
                setActiveTabId(existingTab.id);
              } else {
                const newId = `t-${Date.now()}`;
                safeSetTabs([
                  ...tabs,
                  {
                    id: newId,
                    queryId: id,
                    name: query.name,
                    content: query.content,
                    isDirty: false,
                  },
                ]);
                setActiveTabId(newId);
              }
            }
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
                  label={activeTab.isDirty ? "Save Changes*" : "Save Query"}
                  onClick={handleSave}
                  className={activeTab.isDirty ? "text-primary" : ""}
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
                  {activeTab.name}
                  {activeTab.isDirty ? (
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
                  value={activeTab.content}
                  onChange={handleEditorChange}
                  onSave={handleSave}
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
              <div
                className={cn(
                  "border-l border-border bg-card/50 flex flex-col py-2 shrink-0 transition-[width] duration-200",
                  isTabRailExpanded ? "w-56" : "w-12 items-center",
                )}
              >
                <div
                  className={cn(
                    "flex flex-col gap-2",
                    isTabRailExpanded ? "px-2" : "items-center",
                  )}
                >
                  <Tooltip.Root>
                    <Tooltip.Trigger asChild>
                      <button
                        onClick={handleNewTab}
                        className={cn(
                          "rounded-lg flex items-center text-primary hover:bg-primary/10 transition-colors",
                          isTabRailExpanded
                            ? "w-full px-2 py-1.5 text-xs font-bold"
                            : "w-8 h-8 justify-center",
                        )}
                      >
                        <AddCircle size={20} weight="Bold" />
                        {isTabRailExpanded ? (
                          <span className="ml-2">New Tab</span>
                        ) : null}
                      </button>
                    </Tooltip.Trigger>
                    {!isTabRailExpanded ? (
                      <Tooltip.Portal>
                        <Tooltip.Content
                          className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
                          side="left"
                          sideOffset={10}
                        >
                          New Tab
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    ) : null}
                  </Tooltip.Root>

                  <button
                    onClick={() => setIsTabRailExpanded((prev) => !prev)}
                    className={cn(
                      "rounded-lg flex items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
                      isTabRailExpanded
                        ? "w-full px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest justify-between"
                        : "w-8 h-8 justify-center",
                    )}
                  >
                    {isTabRailExpanded ? (
                      <>
                        <span>Collapse</span>
                        <AltArrowRight size={14} />
                      </>
                    ) : (
                      <AltArrowLeft size={14} />
                    )}
                  </button>
                </div>

                <div
                  className={cn(
                    "mt-3 flex-1 flex flex-col gap-2 overflow-y-auto no-scrollbar",
                    isTabRailExpanded ? "px-2" : "items-center",
                  )}
                >
                  {tabs.map((tab) => (
                    <Tooltip.Root key={tab.id}>
                      <Tooltip.Trigger asChild>
                        <div
                          className={cn(
                            "relative group",
                            isTabRailExpanded ? "w-full" : "",
                          )}
                        >
                          <button
                            onClick={() => handleTabChange(tab.id)}
                            className={cn(
                              "rounded-lg flex items-center transition-all relative",
                              isTabRailExpanded
                                ? "w-full px-2 py-1.5 gap-2 pr-7"
                                : "w-8 h-8 justify-center",
                              activeTabId === tab.id
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <FileText
                              size={18}
                              weight={
                                activeTabId === tab.id ? "Bold" : "Linear"
                              }
                            />
                            {isTabRailExpanded ? (
                              <span className="truncate text-[11px] font-medium flex items-center gap-1">
                                {tab.name}
                                {tab.isDirty ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                ) : null}
                              </span>
                            ) : null}
                            {!isTabRailExpanded && tab.isDirty ? (
                              <div
                                className={cn(
                                  "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                                  activeTabId === tab.id
                                    ? "bg-white"
                                    : "bg-primary",
                                )}
                              />
                            ) : null}
                          </button>

                          <button
                            onClick={(e) => handleRequestCloseTab(e, tab.id)}
                            className={cn(
                              "absolute bg-background rounded-full text-muted-foreground hover:text-error opacity-0 group-hover:opacity-100 transition-opacity shadow-sm",
                              isTabRailExpanded
                                ? "right-1.5 top-1/2 -translate-y-1/2 p-0.5"
                                : "-bottom-1 -right-1 p-0.5",
                            )}
                          >
                            <CloseCircle size={12} weight="Bold" />
                          </button>
                        </div>
                      </Tooltip.Trigger>
                      {!isTabRailExpanded ? (
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 max-w-[120px] truncate"
                            side="left"
                            sideOffset={10}
                          >
                            {tab.name} {tab.isDirty ? "*" : ""}
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      ) : null}
                    </Tooltip.Root>
                  ))}
                </div>
              </div>
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
          onClose={() => setIsDEModalOpen(false)}
        />

        <QueryActivityModal
          isOpen={isQueryActivityModalOpen}
          dataExtensions={dataExtensions}
          initialName={activeTab.name}
          onClose={() => setIsQueryActivityModalOpen(false)}
          onCreate={(draft) => {
            onCreateQueryActivity?.(draft);
            onDeploy?.(activeTab.queryId ?? activeTab.id);
          }}
        />

        <SaveQueryModal
          isOpen={isSaveModalOpen}
          folders={folders}
          initialName={activeTab.name}
          onClose={() => setIsSaveModalOpen(false)}
          onSave={handleFinalSave}
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
