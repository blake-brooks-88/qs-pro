import type { FolderResponse, SavedQueryListItem } from "@qpp/shared-types";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AddFolder,
  AltArrowRight,
  ClockCircle,
  CodeFile,
  Folder as FolderIcon,
  Pen,
  TrashBinMinimalistic,
} from "@solar-icons/react";
import { useCallback, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import {
  useDeleteFolder,
  useFolders,
  useUpdateFolder,
} from "../hooks/use-folders";
import {
  useDeleteSavedQuery,
  useSavedQueries,
  useUpdateSavedQuery,
} from "../hooks/use-saved-queries";
import { InlineRenameInput } from "./InlineRenameInput";

interface QueryTreeViewProps {
  searchQuery: string;
  onSelectQuery: (queryId: string) => void;
  onCreateFolder?: () => void;
  onViewQueryHistory?: (queryId: string) => void;
}

interface FolderNodeProps {
  folder: FolderResponse;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
  childFolders: FolderResponse[];
  childQueries: SavedQueryListItem[];
  expandedFolders: Record<string, boolean>;
  onExpandFolder: (id: string) => void;
  onCollapseFolder: (id: string) => void;
  foldersByParent: Map<string | null, FolderResponse[]>;
  queriesByFolder: Map<string | null, SavedQueryListItem[]>;
  onSelectQuery: (queryId: string) => void;
  renamingId: string | null;
  onStartRename: (id: string) => void;
  onFinishRename: () => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameQuery: (id: string, name: string) => void;
  onDeleteQuery: (id: string) => void;
  onViewQueryHistory?: (queryId: string) => void;
}

interface QueryNodeProps {
  query: SavedQueryListItem;
  depth: number;
  onSelect: () => void;
  isRenaming: boolean;
  onStartRename: () => void;
  onFinishRename: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onViewHistory?: () => void;
}

function QueryNode({
  query,
  depth,
  onSelect,
  isRenaming,
  onStartRename,
  onFinishRename,
  onRename,
  onDelete,
  onViewHistory,
}: QueryNodeProps) {
  if (isRenaming) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-xs"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <CodeFile size={16} className="text-secondary/60 shrink-0" />
        <InlineRenameInput
          initialValue={query.name}
          onSave={onRename}
          onCancel={onFinishRename}
        />
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onStartRename}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded group transition-colors",
            "text-foreground/80 hover:text-foreground hover:bg-surface-hover",
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <CodeFile
            size={16}
            weight="Linear"
            className="text-secondary/60 group-hover:text-secondary shrink-0"
          />
          <span className="truncate">{query.name}</span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
          {onViewHistory ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onViewHistory}
            >
              <ClockCircle size={14} />
              View Run History
            </ContextMenu.Item>
          ) : null}
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
            onSelect={onStartRename}
          >
            <Pen size={14} />
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-border my-1" />
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-destructive/10 text-destructive cursor-pointer outline-none"
            onSelect={onDelete}
          >
            <TrashBinMinimalistic size={14} />
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function FolderNode({
  folder,
  depth,
  isExpanded,
  onToggle,
  childFolders,
  childQueries,
  expandedFolders,
  onExpandFolder,
  onCollapseFolder,
  foldersByParent,
  queriesByFolder,
  onSelectQuery,
  renamingId,
  onStartRename,
  onFinishRename,
  onRenameFolder,
  onDeleteFolder,
  onRenameQuery,
  onDeleteQuery,
  onViewQueryHistory,
}: FolderNodeProps) {
  const isRenaming = renamingId === `folder-${folder.id}`;

  if (isRenaming) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 text-xs"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <AltArrowRight
          size={14}
          className="text-muted-foreground/70 shrink-0"
        />
        <FolderIcon size={16} className="text-muted-foreground/60 shrink-0" />
        <InlineRenameInput
          initialValue={folder.name}
          onSave={(name) => onRenameFolder(folder.id, name)}
          onCancel={onFinishRename}
        />
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            type="button"
            onClick={onToggle}
            onDoubleClick={() => onStartRename(`folder-${folder.id}`)}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1 text-xs font-medium",
              "text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer group rounded",
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <AltArrowRight
              size={14}
              className={cn(
                "transition-transform text-muted-foreground/70 shrink-0",
                isExpanded && "rotate-90",
              )}
            />
            <FolderIcon
              size={16}
              className="text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0"
            />
            <span className="truncate">{folder.name}</span>
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={() => onStartRename(`folder-${folder.id}`)}
            >
              <Pen size={14} />
              Rename
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px bg-border my-1" />
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-destructive/10 text-destructive cursor-pointer outline-none"
              onSelect={() => onDeleteFolder(folder.id)}
            >
              <TrashBinMinimalistic size={14} />
              Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {isExpanded ? (
        <div className="space-y-0.5">
          {childFolders.map((child) => {
            const grandchildFolders = foldersByParent.get(child.id) ?? [];
            const grandchildQueries = queriesByFolder.get(child.id) ?? [];
            return (
              <FolderNode
                key={child.id}
                folder={child}
                depth={depth + 1}
                isExpanded={Boolean(expandedFolders[child.id])}
                onToggle={() =>
                  expandedFolders[child.id]
                    ? onCollapseFolder(child.id)
                    : onExpandFolder(child.id)
                }
                childFolders={grandchildFolders}
                childQueries={grandchildQueries}
                expandedFolders={expandedFolders}
                onExpandFolder={onExpandFolder}
                onCollapseFolder={onCollapseFolder}
                foldersByParent={foldersByParent}
                queriesByFolder={queriesByFolder}
                onSelectQuery={onSelectQuery}
                renamingId={renamingId}
                onStartRename={onStartRename}
                onFinishRename={onFinishRename}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onRenameQuery={onRenameQuery}
                onDeleteQuery={onDeleteQuery}
                onViewQueryHistory={onViewQueryHistory}
              />
            );
          })}
          {childQueries.map((query) => (
            <QueryNode
              key={query.id}
              query={query}
              depth={depth + 1}
              onSelect={() => onSelectQuery(query.id)}
              isRenaming={renamingId === `query-${query.id}`}
              onStartRename={() => onStartRename(`query-${query.id}`)}
              onFinishRename={onFinishRename}
              onRename={(name) => onRenameQuery(query.id, name)}
              onDelete={() => onDeleteQuery(query.id)}
              onViewHistory={
                onViewQueryHistory
                  ? () => onViewQueryHistory(query.id)
                  : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function QueryTreeView({
  searchQuery,
  onSelectQuery,
  onCreateFolder,
  onViewQueryHistory,
}: QueryTreeViewProps) {
  const { data: folders = [] } = useFolders();
  const { data: queries = [] } = useSavedQueries();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const updateQuery = useUpdateSavedQuery();
  const deleteQuery = useDeleteSavedQuery();

  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const filteredFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return folders;
    }
    const query = searchQuery.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(query));
  }, [folders, searchQuery]);

  const filteredQueries = useMemo(() => {
    if (!searchQuery.trim()) {
      return queries;
    }
    const query = searchQuery.toLowerCase();
    return queries.filter((q) => q.name.toLowerCase().includes(query));
  }, [queries, searchQuery]);

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, FolderResponse[]>();
    filteredFolders.forEach((folder) => {
      const key = folder.parentId;
      const existing = map.get(key) ?? [];
      existing.push(folder);
      map.set(key, existing);
    });
    map.forEach((entries) =>
      entries.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    return map;
  }, [filteredFolders]);

  const queriesByFolder = useMemo(() => {
    const map = new Map<string | null, SavedQueryListItem[]>();
    filteredQueries.forEach((query) => {
      const key = query.folderId;
      const existing = map.get(key) ?? [];
      existing.push(query);
      map.set(key, existing);
    });
    map.forEach((entries) =>
      entries.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    return map;
  }, [filteredQueries]);

  const handleExpandFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleCollapseFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: false }));
  }, []);

  const handleRenameFolder = useCallback(
    (id: string, name: string) => {
      updateFolder.mutate({ id, data: { name } });
      setRenamingId(null);
    },
    [updateFolder],
  );

  const handleDeleteFolder = useCallback(
    (id: string) => {
      deleteFolder.mutate(id);
    },
    [deleteFolder],
  );

  const handleRenameQuery = useCallback(
    (id: string, name: string) => {
      updateQuery.mutate({ id, data: { name } });
      setRenamingId(null);
    },
    [updateQuery],
  );

  const handleDeleteQuery = useCallback(
    (id: string) => {
      deleteQuery.mutate(id);
    },
    [deleteQuery],
  );

  const rootFolders = foldersByParent.get(null) ?? [];
  const rootQueries = queriesByFolder.get(null) ?? [];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1 mb-2">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Query Library
        </span>
        {onCreateFolder ? (
          <button
            type="button"
            onClick={onCreateFolder}
            className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-surface-hover"
            title="New Folder"
          >
            <AddFolder size={16} />
          </button>
        ) : null}
      </div>

      {rootFolders.length === 0 && rootQueries.length === 0 ? (
        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
          No saved queries yet.
          <br />
          <span className="text-muted-foreground/70">
            Press Ctrl+S to save your first query.
          </span>
        </div>
      ) : (
        <>
          {rootFolders.map((folder) => {
            const childFolders = foldersByParent.get(folder.id) ?? [];
            const childQueries = queriesByFolder.get(folder.id) ?? [];
            return (
              <FolderNode
                key={folder.id}
                folder={folder}
                depth={0}
                isExpanded={Boolean(expandedFolders[folder.id])}
                onToggle={() =>
                  expandedFolders[folder.id]
                    ? handleCollapseFolder(folder.id)
                    : handleExpandFolder(folder.id)
                }
                childFolders={childFolders}
                childQueries={childQueries}
                expandedFolders={expandedFolders}
                onExpandFolder={handleExpandFolder}
                onCollapseFolder={handleCollapseFolder}
                foldersByParent={foldersByParent}
                queriesByFolder={queriesByFolder}
                onSelectQuery={onSelectQuery}
                renamingId={renamingId}
                onStartRename={setRenamingId}
                onFinishRename={() => setRenamingId(null)}
                onRenameFolder={handleRenameFolder}
                onDeleteFolder={handleDeleteFolder}
                onRenameQuery={handleRenameQuery}
                onDeleteQuery={handleDeleteQuery}
                onViewQueryHistory={onViewQueryHistory}
              />
            );
          })}
          {rootQueries.map((query) => (
            <QueryNode
              key={query.id}
              query={query}
              depth={0}
              onSelect={() => onSelectQuery(query.id)}
              isRenaming={renamingId === `query-${query.id}`}
              onStartRename={() => setRenamingId(`query-${query.id}`)}
              onFinishRename={() => setRenamingId(null)}
              onRename={(name) => handleRenameQuery(query.id, name)}
              onDelete={() => handleDeleteQuery(query.id)}
              onViewHistory={
                onViewQueryHistory
                  ? () => onViewQueryHistory(query.id)
                  : undefined
              }
            />
          ))}
        </>
      )}
    </div>
  );
}
