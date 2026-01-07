import { useState } from 'react';
import type { Folder, SavedQuery, DataExtension } from '@/../product/sections/editor-workspace/types';
import { Database, Folder2, Magnifer, AltArrowLeft, AltArrowRight, Folder as FolderIcon, CodeFile } from '@solar-icons/react';
import { cn } from '@/lib/utils';

interface WorkspaceSidebarProps {
  folders: Folder[];
  savedQueries: SavedQuery[];
  dataExtensions: DataExtension[];
  isCollapsed: boolean;
  onToggle: () => void;
  onSelectQuery?: (id: string) => void;
  onSelectDE?: (id: string) => void;
  onCreateDE?: () => void;
  onCreateFolder?: (parentId: string | null) => void;
}

export function WorkspaceSidebar({
  folders,
  savedQueries,
  dataExtensions,
  isCollapsed,
  onToggle,
  onSelectQuery,
  onSelectDE,
  onCreateFolder
}: WorkspaceSidebarProps) {
  const [activeTab, setActiveTab] = useState<'de' | 'queries'>('de');

  const renderFolderContent = (parentId: string | null, depth: number = 0) => {
    const currentFolders = folders.filter(f => f.parentId === parentId && (activeTab === 'de' ? f.type === 'data-extension' : f.type === 'library'));
    
    return (
      <div className={cn("space-y-0.5", depth > 0 && "ml-3 border-l border-border/50 pl-2")}>
        {currentFolders.map(folder => (
          <div key={folder.id} className="space-y-0.5">
            <div className="flex items-center gap-2 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer group">
              <FolderIcon size={14} className="text-muted-foreground/60 group-hover:text-primary transition-colors" />
              <span>{folder.name}</span>
            </div>
            {renderFolderContent(folder.id, depth + 1)}
          </div>
        ))}
        
        {/* Render Items (Queries or DEs) in this folder */}
        {activeTab === 'de' ? (
          dataExtensions.filter(de => de.folderId === parentId).map(de => (
            <button
              key={de.id}
              onClick={() => onSelectDE?.(de.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-muted rounded group transition-colors"
            >
              <Database size={14} weight="Linear" className="text-primary/60 group-hover:text-primary" />
              <span className="truncate">{de.name}</span>
            </button>
          ))
        ) : (
          savedQueries.filter(q => q.folderId === parentId).map(q => (
            <button
              key={q.id}
              onClick={() => onSelectQuery?.(q.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:bg-muted rounded group transition-colors"
            >
              <CodeFile size={14} weight="Linear" className="text-secondary/60 group-hover:text-secondary" />
              <span className="truncate">{q.name}</span>
            </button>
          ))
        )}
      </div>
    );
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-r border-border bg-background flex flex-col items-center py-4 gap-6 shrink-0">
        <button onClick={onToggle} className="p-2 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <AltArrowRight size={20} />
        </button>
        <div className="h-px w-6 bg-border" />
        <button onClick={() => {setActiveTab('de'); onToggle();}} className="p-2 text-muted-foreground hover:text-primary">
          <Database size={20} weight={activeTab === 'de' ? 'Bold' : 'Linear'} />
        </button>
        <button onClick={() => {setActiveTab('queries'); onToggle();}} className="p-2 text-muted-foreground hover:text-primary">
          <Folder2 size={20} weight={activeTab === 'queries' ? 'Bold' : 'Linear'} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 border-r border-border bg-background flex flex-col shrink-0 animate-fade-in">
      {/* Tab Switcher */}
      <div className="flex border-b border-border bg-card">
        <button
          onClick={() => setActiveTab('de')}
          className={cn(
            "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors",
            activeTab === 'de' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Database size={14} weight={activeTab === 'de' ? 'Bold' : 'Linear'} />
          Data
        </button>
        <button
          onClick={() => setActiveTab('queries')}
          className={cn(
            "flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 border-b-2 transition-colors",
            activeTab === 'queries' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Folder2 size={14} weight={activeTab === 'queries' ? 'Bold' : 'Linear'} />
          Queries
        </button>
        <button onClick={onToggle} className="px-3 text-muted-foreground hover:text-foreground">
          <AltArrowLeft size={16} />
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Magnifer className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder={activeTab === 'de' ? "Search Extensions..." : "Search Saved Queries..."}
            className="w-full bg-muted border border-border rounded-md pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 text-foreground"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
          <div className="flex items-center justify-between px-2 py-1 mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {activeTab === 'de' ? 'Data Extensions' : 'Query Library'}
            </span>
            {activeTab === 'queries' && (
              <button 
                onClick={() => onCreateFolder?.(null)}
                className="text-[10px] font-bold text-primary hover:text-primary-400 underline decoration-primary/30 underline-offset-2"
              >
                + New Folder
              </button>
            )}
          </div>
          
          {renderFolderContent(null)}
        </div>
      </div>
    </div>
  );
}
