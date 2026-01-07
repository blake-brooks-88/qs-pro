import { useState, type ReactNode, useEffect } from 'react';
import type { EditorWorkspaceProps, QueryTab } from '@/../product/sections/editor-workspace/types';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import { ResultsPane } from './ResultsPane';
import { DataExtensionModal } from './DataExtensionModal';
import { QueryActivityModal } from './QueryActivityModal';
import { SaveQueryModal } from './SaveQueryModal';
import { ConfirmationDialog } from './ConfirmationDialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { 
  Play, 
  Diskette, 
  Download, 
  Rocket, 
  MenuDots, 
  BombMinimalistic,
  Code,
  Database,
  AddCircle,
  CloseCircle,
  FileText
} from '@solar-icons/react';
import { cn } from '@/lib/utils';

export function EditorWorkspace({
  folders,
  savedQueries,
  dataExtensions,
  executionResult,
  initialTabs,
  isSidebarCollapsed: initialSidebarCollapsed,
  onRun,
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
  onNewTab
}: EditorWorkspaceProps) {
// ... existing state ...
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [isDEModalOpen, setIsDEModalOpen] = useState(false);
  const [isQueryActivityModalOpen, setIsQueryActivityModalOpen] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isConfirmCloseOpen, setIsConfirmCloseOpen] = useState(false);
  const [tabToClose, setTabToClose] = useState<string | null>(null);
  
  // Tab Management
  const [tabs, setTabs] = useState<QueryTab[]>(initialTabs || [
    { id: 't-1', name: 'New Query', content: '', isDirty: false, isNew: true }
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0]?.id || '');

  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  // Dirty State & BeforeUnload
  useEffect(() => {
    const hasDirtyTabs = tabs.some(t => t.isDirty);
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasDirtyTabs) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [tabs]);

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
      name: 'Untitled Query',
      content: '',
      isDirty: false,
      isNew: true
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
    onNewTab?.();
  };

  const handleTabChange = (id: string) => {
    setActiveTabId(id);
    onTabChange?.(id);
  };

  const handleRequestCloseTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === id);
    if (tab?.isDirty) {
      setTabToClose(id);
      setIsConfirmCloseOpen(true);
    } else {
      handleCloseTab(id);
    }
  };

  const handleCloseTab = (id: string) => {
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      const defaultTab = { id: 't-1', name: 'New Query', content: '', isDirty: false, isNew: true };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    } else {
      setTabs(newTabs);
      if (activeTabId === id) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
    }
    onTabClose?.(id);
    setTabToClose(null);
  };

  const handleEditorChange = (content: string) => {
    setTabs(tabs.map(t => t.id === activeTabId ? { ...t, content, isDirty: true } : t));
  };

  const handleSave = () => {
    if (activeTab.isNew) {
      setIsSaveModalOpen(true);
    } else {
      setTabs(tabs.map(t => t.id === activeTabId ? { ...t, isDirty: false } : t));
      onSave?.(activeTab.id, activeTab.content);
    }
  };

  const handleFinalSave = (name: string, folderId: string) => {
    setTabs(tabs.map(t => t.id === activeTabId ? { ...t, name, isDirty: false, isNew: false } : t));
    onSaveAs?.(activeTab.id, name, folderId);
    setIsSaveModalOpen(false);
  };

  // Listen for sidebar selection to open in new tab or existing
  useEffect(() => {
    // This is a mock implementation as the selection usually comes from the sidebar component
    // In a real app, onSelectQuery would trigger this
  }, []);

  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="flex flex-1 overflow-hidden bg-background text-foreground font-sans h-full">
        {/* Sidebar Explorer */}
        <WorkspaceSidebar 
          folders={folders}
          savedQueries={savedQueries}
          dataExtensions={dataExtensions}
          isCollapsed={isSidebarCollapsed}
          onToggle={handleToggleSidebar}
          onSelectQuery={(id) => {
            const query = savedQueries.find(q => q.id === id);
            if (query) {
              const existingTab = tabs.find(t => t.queryId === id);
              if (existingTab) {
                setActiveTabId(existingTab.id);
              } else {
                const newId = `t-${Date.now()}`;
                setTabs([...tabs, { 
                  id: newId, 
                  queryId: id, 
                  name: query.name, 
                  content: query.content, 
                  isDirty: false 
                }]);
                setActiveTabId(newId);
              }
            }
            onSelectQuery?.(id);
          }}
          onSelectDE={onSelectDE}
          onCreateDE={handleCreateDE}
        />

        {/* Main IDE Workspace */}
        <div className="flex-1 flex flex-col min-w-0">
          
          {/* Workspace Header / Toolbar */}
          <div className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-4">
              <div className="flex items-center">
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button 
                      onClick={() => onRun?.('temp')}
                      className="flex items-center gap-2 bg-success hover:brightness-110 text-success-foreground h-8 px-4 rounded-l-md text-xs font-bold transition-all shadow-lg shadow-success/20 active:scale-95"
                    >
                      <Play size={16} weight="Bold" />
                      RUN
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50" sideOffset={5}>
                      Execute SQL (Ctrl+Enter)
                      <Tooltip.Arrow className="fill-foreground" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
                
                <button className="h-8 px-2 bg-success brightness-90 hover:brightness-100 text-success-foreground border-l border-black/10 rounded-r-md active:scale-95">
                  <MenuDots size={14} weight="Bold" />
                </button>
              </div>

              <div className="h-4 w-px bg-border mx-1" />

              <div className="flex items-center gap-1">
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
                <ToolbarButton 
                  icon={<Database size={18} />} 
                  label="Create Data Extension" 
                  onClick={handleCreateDE}
                  className="text-primary hover:text-primary-foreground hover:bg-primary"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end mr-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Tab</span>
                <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                  {activeTab.name}
                  {activeTab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                </span>
              </div>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button 
                    onClick={handleOpenQueryActivityModal}
                    className="flex items-center gap-2 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground h-8 px-4 rounded-md text-xs font-bold transition-all group active:scale-95"
                  >
                    <Rocket size={16} weight="Bold" className="group-hover:animate-bounce" />
                    Deploy to Automation
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50" sideOffset={5}>
                    Create permanent MCE Activity
                    <Tooltip.Arrow className="fill-foreground" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </div>
          </div>

          {/* Editor & Results Pane Split */}
          <div className="flex-1 flex flex-col min-h-0">
            
            {/* Editor Area with Vertical Tabs */}
            <div className="flex-1 flex min-h-0">
              
              {/* Mock Monaco Editor Pane */}
              <div className="flex-1 relative bg-background/50 overflow-hidden font-mono">
                {/* Line Numbers */}
                <div className="absolute left-0 top-0 bottom-0 w-10 bg-muted/20 border-r border-border flex flex-col items-center py-4 text-[10px] text-muted-foreground select-none">
                    {Array.from({length: 12}).map((_, i) => <span key={i} className="h-5 leading-5">{i + 1}</span>)}
                </div>
                
                {/* Code Area */}
                <div 
                  className="ml-10 p-4 text-sm leading-5 overflow-auto h-full outline-none focus:ring-1 focus:ring-inset focus:ring-primary/20"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => handleEditorChange(e.currentTarget.innerText)}
                  onKeyDown={(e) => {
                    if (e.ctrlKey && e.key === 's') {
                      e.preventDefault();
                      handleSave();
                    }
                  }}
                >
                    <div className="space-y-0.5 font-mono whitespace-pre-wrap">
                      {activeTab.content || <span className="text-muted-foreground italic">-- Start typing your SQL here...</span>}
                    </div>
                </div>

                {/* Guardrail In-Line Feedback (Simulated) */}
                <div className="absolute bottom-6 right-6">
                    <div className="bg-card border border-error shadow-2xl rounded-lg p-3 max-w-xs animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex gap-2 text-error mb-1">
                          <BombMinimalistic size={16} weight="Bold" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Guardrail Violation</span>
                      </div>
                      <p className="text-[11px] text-foreground leading-relaxed">
                          Prohibited Keyword: <span className="text-error font-bold">DELETE</span> is not supported in Query Studio mode.
                      </p>
                    </div>
                </div>
              </div>

              {/* Vertical Tabs Sidebar (Right Side) */}
              <div className="w-12 border-l border-border bg-card/50 flex flex-col items-center py-2 gap-2 shrink-0">
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <button 
                      onClick={handleNewTab}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-colors"
                    >
                      <AddCircle size={22} weight="Bold" />
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50" side="left" sideOffset={10}>
                      New Tab
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>

                <div className="h-px w-6 bg-border mx-auto my-1" />

                <div className="flex-1 flex flex-col gap-2 overflow-y-auto w-full items-center no-scrollbar">
                  {tabs.map((tab) => (
                    <Tooltip.Root key={tab.id}>
                      <Tooltip.Trigger asChild>
                        <div className="relative group">
                          <button
                            onClick={() => handleTabChange(tab.id)}
                            className={cn(
                              "w-8 h-8 rounded-lg flex items-center justify-center transition-all relative",
                              activeTabId === tab.id 
                                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            <FileText size={18} weight={activeTabId === tab.id ? "Bold" : "Linear"} />
                            {tab.isDirty && (
                              <div className={cn(
                                "absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-background",
                                activeTabId === tab.id ? "bg-white" : "bg-primary"
                              )} />
                            )}
                          </button>
                          
                          {/* Close button that shows on hover */}
                          <button
                            onClick={(e) => handleRequestCloseTab(e, tab.id)}
                            className="absolute -bottom-1 -right-1 bg-background rounded-full text-muted-foreground hover:text-error opacity-0 group-hover:opacity-100 transition-opacity p-0.5 shadow-sm"
                          >
                            <CloseCircle size={12} weight="Bold" />
                          </button>
                        </div>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 max-w-[120px] truncate" side="left" sideOffset={10}>
                          {tab.name} {tab.isDirty ? '*' : ''}
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  ))}
                </div>
              </div>
            </div>

            {/* Results Resizable Pane */}
            <div className="h-[40%] flex flex-col min-h-[150px]">
              <ResultsPane 
                result={executionResult}
                onPageChange={onPageChange}
                onViewInContactBuilder={() => onViewInContactBuilder?.(executionResult.rows[0]?.SubscriberKey)}
              />
            </div>
          </div>
        </div>

        {/* Modals */}
        <DataExtensionModal 
          isOpen={isDEModalOpen}
          onClose={() => setIsDEModalOpen(false)}
          onSave={(data) => console.log('Saving DE:', data)}
        />

        <QueryActivityModal
          isOpen={isQueryActivityModalOpen}
          dataExtensions={dataExtensions}
          initialName={activeTab.name}
          onClose={() => setIsQueryActivityModalOpen(false)}
          onCreate={(draft) => {
            onCreateQueryActivity?.(draft);
            onDeploy?.(activeTab.queryId || activeTab.id);
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
            if (tabToClose) handleCloseTab(tabToClose);
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

function ToolbarButton({ icon, label, onClick, className }: ToolbarButtonProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button 
          onClick={onClick}
          className={cn(
            "p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-all active:scale-95",
            className
          )}
        >
          {icon}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content 
          className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50 font-bold uppercase tracking-tight" 
          sideOffset={5}
        >
          {label}
          <Tooltip.Arrow className="fill-foreground" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
