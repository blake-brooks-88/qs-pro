import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { FolderResponse, SavedQueryListItem } from "@qpp/shared-types";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AddFolder,
  AltArrowRight,
  ClockCircle,
  CodeFile,
  Folder as FolderIcon,
  History,
  LinkBrokenMinimalistic,
  Pen,
  TrashBinMinimalistic,
} from "@solar-icons/react";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import api from "@/services/api";

import {
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useShareFolder,
  useUpdateFolder,
} from "../hooks/use-folders";
import {
  useCreateSavedQuery,
  useDeleteSavedQuery,
  useSavedQueries,
  useUpdateSavedQuery,
} from "../hooks/use-saved-queries";
import { getFolderAncestors, getFolderPath } from "../utils/folder-utils";
import { InlineRenameInput } from "./InlineRenameInput";
import { LinkedBadge } from "./LinkedBadge";
import { ShareConfirmationDialog } from "./ShareConfirmationDialog";
import { SharedQuerySection } from "./SharedQuerySection";

const ROOT_DROPPABLE_ID = "__root__";
const SHARED_DROP_ZONE_ID = "__shared__";

function isOptimisticFolderId(folderId: string) {
  return folderId.startsWith("temp-");
}

function parseDraggableId(id: string): {
  type: "query" | "folder";
  id: string;
} {
  if (id.startsWith("query-")) {
    return { type: "query", id: id.slice("query-".length) };
  }
  if (id.startsWith("folder-")) {
    return { type: "folder", id: id.slice("folder-".length) };
  }
  return { type: "query", id };
}

interface QueryTreeViewProps {
  searchQuery: string;
  onSelectQuery: (queryId: string) => void;
  onViewQueryHistory?: (queryId: string) => void;
  onViewVersionHistory?: (queryId: string) => void;
  onLinkQuery?: (queryId: string) => void;
  onUnlinkQuery?: (queryId: string) => void;
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
  onViewVersionHistory?: (queryId: string) => void;
  onLinkQuery?: (queryId: string) => void;
  onUnlinkQuery?: (queryId: string) => void;
  creatingIn: string | null;
  onStartCreate: (parentId: string | null) => void;
  onFinishCreate: (name: string | null) => void;
  allFolders: FolderResponse[];
  onMoveQueryToFolder: (queryId: string, folderId: string | null) => void;
  folderVisibilityMap: Map<string, "personal" | "shared">;
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
  onViewVersionHistory?: () => void;
  onLinkQuery?: () => void;
  onUnlinkQuery?: () => void;
  allFolders: FolderResponse[];
  onMoveToFolder: (folderId: string | null) => void;
  isInSharedFolder: boolean;
}

function DraggableQueryNode(props: QueryNodeProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `query-${props.query.id}`,
    data: { type: "query", queryId: props.query.id },
    disabled: props.isRenaming,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(isDragging && "opacity-40")}
    >
      <QueryNode {...props} />
    </div>
  );
}

function RootDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROPPABLE_ID });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded transition-colors min-h-6",
        isOver && "bg-primary/5 ring-1 ring-primary/50",
      )}
      aria-label="Root drop zone"
    >
      {children}
    </div>
  );
}

function SharedDropZone({ children }: { children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: SHARED_DROP_ZONE_ID });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded transition-colors",
        isOver && "bg-primary/5 ring-1 ring-primary/50",
      )}
      aria-label="Shared drop zone"
    >
      {children}
    </div>
  );
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
  onViewVersionHistory,
  onLinkQuery: _onLinkQuery,
  onUnlinkQuery,
  allFolders,
  onMoveToFolder,
  isInSharedFolder,
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

  const personalFolders = allFolders.filter(
    (f) => (f.visibility ?? "personal") === "personal",
  );

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
          {query.linkedQaCustomerKey ? (
            <LinkedBadge
              size="sm"
              qaName={query.linkedQaName}
              className="shrink-0"
            />
          ) : null}
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
          {onViewVersionHistory ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onViewVersionHistory}
            >
              <History size={14} />
              Version History
            </ContextMenu.Item>
          ) : null}
          {!isInSharedFolder && onUnlinkQuery && query.linkedQaCustomerKey ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onUnlinkQuery}
            >
              <LinkBrokenMinimalistic size={14} />
              Unlink from Query Activity
            </ContextMenu.Item>
          ) : null}
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none">
              <FolderIcon size={14} /> Move to Folder
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="min-w-[200px] max-h-64 overflow-y-auto bg-popover border border-border rounded-md shadow-lg p-1 z-50">
                <ContextMenu.Item
                  className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
                  onSelect={() => onMoveToFolder(null)}
                >
                  No Folder (Root)
                </ContextMenu.Item>
                <ContextMenu.Separator className="h-px bg-border my-1" />
                {personalFolders.map((folder) => (
                  <ContextMenu.Item
                    key={folder.id}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
                    disabled={isOptimisticFolderId(folder.id)}
                    onSelect={() => onMoveToFolder(folder.id)}
                  >
                    <FolderIcon size={14} />{" "}
                    {getFolderPath(personalFolders, folder.id) || folder.name}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
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
  onViewVersionHistory,
  onLinkQuery,
  onUnlinkQuery,
  creatingIn,
  onStartCreate,
  onFinishCreate,
  allFolders,
  onMoveQueryToFolder,
  folderVisibilityMap,
}: FolderNodeProps) {
  const isOptimistic = isOptimisticFolderId(folder.id);
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: folder.id,
    disabled: isOptimistic,
  });
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: `folder-${folder.id}`,
    data: { type: "folder", folderId: folder.id },
    disabled: isOptimistic,
  });
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

  const setCombinedRef = (node: HTMLButtonElement | null) => {
    setDropRef(node);
    setDragRef(node);
  };

  return (
    <div className="space-y-0.5">
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <button
            ref={setCombinedRef}
            type="button"
            onClick={onToggle}
            onDoubleClick={() => {
              if (isOptimistic) {
                return;
              }
              onStartRename(`folder-${folder.id}`);
            }}
            {...listeners}
            {...attributes}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1 text-xs font-medium",
              "text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer group rounded",
              isOver && "ring-1 ring-primary bg-primary/5",
              isDragging && "opacity-40",
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
              disabled={isOptimistic}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
              onSelect={() => onStartCreate(folder.id)}
            >
              <AddFolder size={14} />
              New Subfolder
            </ContextMenu.Item>
            <ContextMenu.Item
              disabled={isOptimistic}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
              onSelect={() => onStartRename(`folder-${folder.id}`)}
            >
              <Pen size={14} />
              Rename
            </ContextMenu.Item>
            <ContextMenu.Separator className="h-px bg-border my-1" />
            <ContextMenu.Item
              disabled={isOptimistic}
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-destructive/10 text-destructive cursor-pointer outline-none data-[disabled]:opacity-50 data-[disabled]:pointer-events-none"
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
          {creatingIn === folder.id && (
            <div
              className="flex items-center gap-2 px-2 py-1 text-xs"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              <FolderIcon
                size={16}
                className="text-muted-foreground/60 shrink-0"
              />
              <InlineRenameInput
                initialValue=""
                onSave={(name) => onFinishCreate(name)}
                onCancel={() => onFinishCreate(null)}
              />
            </div>
          )}
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
                onViewVersionHistory={onViewVersionHistory}
                onLinkQuery={onLinkQuery}
                onUnlinkQuery={onUnlinkQuery}
                creatingIn={creatingIn}
                onStartCreate={onStartCreate}
                onFinishCreate={onFinishCreate}
                allFolders={allFolders}
                onMoveQueryToFolder={onMoveQueryToFolder}
                folderVisibilityMap={folderVisibilityMap}
              />
            );
          })}
          {childQueries.map((query) => (
            <DraggableQueryNode
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
              onViewVersionHistory={
                onViewVersionHistory
                  ? () => onViewVersionHistory(query.id)
                  : undefined
              }
              onLinkQuery={undefined}
              onUnlinkQuery={
                onUnlinkQuery ? () => onUnlinkQuery(query.id) : undefined
              }
              allFolders={allFolders}
              onMoveToFolder={(folderId) =>
                onMoveQueryToFolder(query.id, folderId)
              }
              isInSharedFolder={false}
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
  onViewQueryHistory,
  onViewVersionHistory,
  onLinkQuery,
  onUnlinkQuery,
}: QueryTreeViewProps) {
  const { data: folders = [] } = useFolders();
  const { data: queries = [] } = useSavedQueries();
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const deleteFolder = useDeleteFolder();
  const shareFolder = useShareFolder();
  const updateQuery = useUpdateSavedQuery();
  const deleteQuery = useDeleteSavedQuery();
  const createSavedQuery = useCreateSavedQuery();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const [draggedItem, setDraggedItem] = useState<{
    type: "query" | "folder";
    id: string;
  } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [sharedCreatingIn, setSharedCreatingIn] = useState<string | null>(null);

  const [shareConfirm, setShareConfirm] = useState<{
    itemName: string;
    itemType: "folder" | "query";
    itemId: string;
    targetFolderId: string | null;
  } | null>(null);

  const folderVisibilityMap = useMemo(() => {
    const map = new Map<string, "personal" | "shared">();
    for (const folder of folders) {
      map.set(folder.id, folder.visibility ?? "personal");
    }
    return map;
  }, [folders]);

  const personalFolders = useMemo(
    () => folders.filter((f) => (f.visibility ?? "personal") === "personal"),
    [folders],
  );

  const sharedFolders = useMemo(
    () => folders.filter((f) => f.visibility === "shared"),
    [folders],
  );

  const getQueryVisibility = useCallback(
    (query: SavedQueryListItem): "personal" | "shared" => {
      if (!query.folderId) {
        return "personal";
      }
      return folderVisibilityMap.get(query.folderId) ?? "personal";
    },
    [folderVisibilityMap],
  );

  const personalQueries = useMemo(
    () => queries.filter((q) => getQueryVisibility(q) === "personal"),
    [queries, getQueryVisibility],
  );

  const sharedQueries = useMemo(
    () => queries.filter((q) => getQueryVisibility(q) === "shared"),
    [queries, getQueryVisibility],
  );

  const filteredPersonalFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return personalFolders;
    }
    const query = searchQuery.toLowerCase();
    return personalFolders.filter((f) => f.name.toLowerCase().includes(query));
  }, [personalFolders, searchQuery]);

  const filteredPersonalQueries = useMemo(() => {
    if (!searchQuery.trim()) {
      return personalQueries;
    }
    const query = searchQuery.toLowerCase();
    return personalQueries.filter((q) => q.name.toLowerCase().includes(query));
  }, [personalQueries, searchQuery]);

  const filteredSharedFolders = useMemo(() => {
    if (!searchQuery.trim()) {
      return sharedFolders;
    }
    const query = searchQuery.toLowerCase();
    return sharedFolders.filter((f) => f.name.toLowerCase().includes(query));
  }, [sharedFolders, searchQuery]);

  const filteredSharedQueries = useMemo(() => {
    if (!searchQuery.trim()) {
      return sharedQueries;
    }
    const query = searchQuery.toLowerCase();
    return sharedQueries.filter((q) => q.name.toLowerCase().includes(query));
  }, [sharedQueries, searchQuery]);

  const personalFoldersByParent = useMemo(() => {
    const map = new Map<string | null, FolderResponse[]>();
    filteredPersonalFolders.forEach((folder) => {
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
  }, [filteredPersonalFolders]);

  const personalQueriesByFolder = useMemo(() => {
    const map = new Map<string | null, SavedQueryListItem[]>();
    filteredPersonalQueries.forEach((query) => {
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
  }, [filteredPersonalQueries]);

  const sharedFoldersByParent = useMemo(() => {
    const map = new Map<string | null, FolderResponse[]>();
    filteredSharedFolders.forEach((folder) => {
      const key = folder.parentId;
      if (key && folderVisibilityMap.get(key) === "shared") {
        const existing = map.get(key) ?? [];
        existing.push(folder);
        map.set(key, existing);
      } else {
        const existing = map.get(null) ?? [];
        existing.push(folder);
        map.set(null, existing);
      }
    });
    map.forEach((entries) =>
      entries.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    );
    return map;
  }, [filteredSharedFolders, folderVisibilityMap]);

  const sharedQueriesByFolder = useMemo(() => {
    const map = new Map<string | null, SavedQueryListItem[]>();
    filteredSharedQueries.forEach((query) => {
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
  }, [filteredSharedQueries]);

  const [isPersonalExpanded, setIsPersonalExpanded] = useState(true);

  const handleExpandFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleCollapseFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: false }));
  }, []);

  const handleRenameFolder = useCallback(
    (id: string, name: string) => {
      if (isOptimisticFolderId(id)) {
        setRenamingId(null);
        return;
      }
      updateFolder.mutate({ id, data: { name } });
      setRenamingId(null);
    },
    [updateFolder],
  );

  const handleDeleteFolder = useCallback(
    (id: string) => {
      if (isOptimisticFolderId(id)) {
        return;
      }
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

  const handleStartCreate = useCallback(
    (parentId: string | null) => {
      if (parentId && isOptimisticFolderId(parentId)) {
        return;
      }
      setCreatingIn(parentId ?? "");
      if (parentId) {
        handleExpandFolder(parentId);
      }
    },
    [handleExpandFolder],
  );

  const handleFinishCreate = useCallback(
    (name: string | null) => {
      if (name) {
        createFolder.mutate({
          name,
          parentId: creatingIn === "" ? null : creatingIn,
        });
      }
      setCreatingIn(null);
    },
    [createFolder, creatingIn],
  );

  const handleStartSharedCreate = useCallback(
    (parentId: string | null) => {
      if (parentId && isOptimisticFolderId(parentId)) {
        return;
      }
      setSharedCreatingIn(parentId ?? "");
      if (parentId) {
        handleExpandFolder(parentId);
      }
    },
    [handleExpandFolder],
  );

  const handleFinishSharedCreate = useCallback(
    (name: string | null) => {
      if (name) {
        createFolder.mutate({
          name,
          parentId: sharedCreatingIn === "" ? null : sharedCreatingIn,
          visibility: "shared",
        });
      }
      setSharedCreatingIn(null);
    },
    [createFolder, sharedCreatingIn],
  );

  const handleMoveQuery = useCallback(
    (queryId: string, folderId: string | null) => {
      updateQuery.mutate({ id: queryId, data: { folderId } });
    },
    [updateQuery],
  );

  const handleDuplicateToPersonal = useCallback(
    async (queryId: string) => {
      const query = queries.find((q) => q.id === queryId);
      if (!query) {
        return;
      }

      try {
        const response = await api.get<{ sqlText: string }>(
          `/saved-queries/${queryId}`,
        );
        createSavedQuery.mutate({
          name: `${query.name} (copy)`,
          sqlText: response.data.sqlText,
          folderId: null,
        });
        toast.success("Query duplicated to My Queries");
      } catch {
        createSavedQuery.mutate({
          name: `${query.name} (copy)`,
          sqlText: "",
          folderId: null,
        });
        toast.success("Query duplicated to My Queries (without content)");
      }
    },
    [queries, createSavedQuery],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const parsed = parseDraggableId(String(event.active.id));
    setDraggedItem(parsed);
  }, []);

  const handleShareConfirm = useCallback(() => {
    if (!shareConfirm) {
      return;
    }

    if (shareConfirm.itemType === "folder") {
      shareFolder.mutate(shareConfirm.itemId);
    } else {
      if (shareConfirm.targetFolderId) {
        updateQuery.mutate({
          id: shareConfirm.itemId,
          data: { folderId: shareConfirm.targetFolderId },
        });
      }
    }
    setShareConfirm(null);
  }, [shareConfirm, shareFolder, updateQuery]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setDraggedItem(null);

      if (!over) {
        return;
      }

      const parsed = parseDraggableId(String(active.id));
      const targetId = String(over.id);

      if (parsed.type === "query") {
        const query = queries.find((q) => q.id === parsed.id);
        if (!query) {
          return;
        }

        const sourceVisibility = getQueryVisibility(query);

        if (targetId === SHARED_DROP_ZONE_ID) {
          if (sourceVisibility === "shared") {
            return;
          }
          toast.error(
            "Drag a folder to share it. Individual queries inherit visibility from their folder.",
          );
          return;
        }

        const targetFolderId = targetId === ROOT_DROPPABLE_ID ? null : targetId;

        if (targetFolderId && isOptimisticFolderId(targetFolderId)) {
          return;
        }

        if (query.folderId === targetFolderId) {
          return;
        }

        const targetVisibility = targetFolderId
          ? (folderVisibilityMap.get(targetFolderId) ?? "personal")
          : "personal";

        if (sourceVisibility === "shared" && targetVisibility === "personal") {
          toast.info(
            "Shared items cannot be moved to personal. Use 'Duplicate to Personal' from the context menu instead.",
          );
          return;
        }

        if (sourceVisibility === "personal" && targetVisibility === "shared") {
          setShareConfirm({
            itemName: query.name,
            itemType: "query",
            itemId: parsed.id,
            targetFolderId,
          });
          return;
        }

        updateQuery.mutate({
          id: parsed.id,
          data: { folderId: targetFolderId },
        });
        return;
      }

      if (parsed.type === "folder") {
        if (isOptimisticFolderId(parsed.id)) {
          return;
        }

        const draggedFolder = folders.find((f) => f.id === parsed.id);
        if (!draggedFolder) {
          return;
        }

        const sourceVisibility =
          folderVisibilityMap.get(parsed.id) ?? "personal";

        if (targetId === SHARED_DROP_ZONE_ID) {
          if (sourceVisibility === "shared") {
            return;
          }
          setShareConfirm({
            itemName: draggedFolder.name,
            itemType: "folder",
            itemId: parsed.id,
            targetFolderId: null,
          });
          return;
        }

        const targetFolderId = targetId === ROOT_DROPPABLE_ID ? null : targetId;

        if (targetFolderId && isOptimisticFolderId(targetFolderId)) {
          return;
        }

        if (targetFolderId === parsed.id) {
          return;
        }

        if (draggedFolder.parentId === targetFolderId) {
          return;
        }

        if (targetFolderId) {
          const targetAncestors = getFolderAncestors(folders, targetFolderId);
          const isDescendant = targetAncestors.some((a) => a.id === parsed.id);
          if (isDescendant) {
            return;
          }
        }

        const targetVisibility = targetFolderId
          ? (folderVisibilityMap.get(targetFolderId) ?? "personal")
          : "personal";

        if (sourceVisibility === "shared" && targetVisibility === "personal") {
          toast.info("Shared folders cannot be moved to personal.");
          return;
        }

        if (sourceVisibility === "personal" && targetVisibility === "shared") {
          setShareConfirm({
            itemName: draggedFolder.name,
            itemType: "folder",
            itemId: parsed.id,
            targetFolderId,
          });
          return;
        }

        updateFolder.mutate({
          id: parsed.id,
          data: { parentId: targetFolderId },
        });
      }
    },
    [
      folders,
      queries,
      updateFolder,
      updateQuery,
      folderVisibilityMap,
      getQueryVisibility,
    ],
  );

  const rootPersonalFolders = personalFoldersByParent.get(null) ?? [];
  const rootPersonalQueries = personalQueriesByFolder.get(null) ?? [];

  const draggedQuery =
    draggedItem?.type === "query"
      ? queries.find((q) => q.id === draggedItem.id)
      : null;
  const draggedFolder =
    draggedItem?.type === "folder"
      ? folders.find((f) => f.id === draggedItem.id)
      : null;

  return (
    <div className="space-y-1">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* My Queries Section */}
        <div>
          <div className="flex items-center justify-between px-2 py-1 mb-2">
            <button
              type="button"
              onClick={() => setIsPersonalExpanded((prev) => !prev)}
              className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <AltArrowRight
                size={12}
                className={cn(
                  "transition-transform",
                  isPersonalExpanded && "rotate-90",
                )}
              />
              My Queries
            </button>
            <button
              type="button"
              onClick={() => handleStartCreate(null)}
              className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-surface-hover"
              title="New Folder"
            >
              <AddFolder size={16} />
            </button>
          </div>

          {isPersonalExpanded ? (
            <>
              {creatingIn === "" && (
                <div
                  className="flex items-center gap-2 px-2 py-1 text-xs"
                  style={{ paddingLeft: "8px" }}
                >
                  <FolderIcon
                    size={16}
                    className="text-muted-foreground/60 shrink-0"
                  />
                  <InlineRenameInput
                    initialValue=""
                    onSave={(name) => handleFinishCreate(name)}
                    onCancel={() => handleFinishCreate(null)}
                  />
                </div>
              )}

              {rootPersonalFolders.length === 0 &&
              rootPersonalQueries.length === 0 &&
              creatingIn === null ? (
                <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No saved queries yet.
                  <br />
                  <span className="text-muted-foreground/70">
                    Press Ctrl+S to save your first query.
                  </span>
                </div>
              ) : (
                <>
                  {rootPersonalFolders.map((folder) => {
                    const childFolders =
                      personalFoldersByParent.get(folder.id) ?? [];
                    const childQueries =
                      personalQueriesByFolder.get(folder.id) ?? [];
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
                        foldersByParent={personalFoldersByParent}
                        queriesByFolder={personalQueriesByFolder}
                        onSelectQuery={onSelectQuery}
                        renamingId={renamingId}
                        onStartRename={setRenamingId}
                        onFinishRename={() => setRenamingId(null)}
                        onRenameFolder={handleRenameFolder}
                        onDeleteFolder={handleDeleteFolder}
                        onRenameQuery={handleRenameQuery}
                        onDeleteQuery={handleDeleteQuery}
                        onViewQueryHistory={onViewQueryHistory}
                        onViewVersionHistory={onViewVersionHistory}
                        onLinkQuery={undefined}
                        onUnlinkQuery={onUnlinkQuery}
                        creatingIn={creatingIn}
                        onStartCreate={handleStartCreate}
                        onFinishCreate={handleFinishCreate}
                        allFolders={personalFolders}
                        onMoveQueryToFolder={handleMoveQuery}
                        folderVisibilityMap={folderVisibilityMap}
                      />
                    );
                  })}
                  <RootDropZone>
                    {draggedItem && rootPersonalQueries.length === 0 ? (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/70">
                        Drop here to move to root
                      </div>
                    ) : null}
                    {rootPersonalQueries.map((query) => (
                      <DraggableQueryNode
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
                        onViewVersionHistory={
                          onViewVersionHistory
                            ? () => onViewVersionHistory(query.id)
                            : undefined
                        }
                        onLinkQuery={undefined}
                        onUnlinkQuery={
                          onUnlinkQuery
                            ? () => onUnlinkQuery(query.id)
                            : undefined
                        }
                        allFolders={personalFolders}
                        onMoveToFolder={(folderId) =>
                          handleMoveQuery(query.id, folderId)
                        }
                        isInSharedFolder={false}
                      />
                    ))}
                  </RootDropZone>
                </>
              )}
            </>
          ) : null}
        </div>

        {/* Shared Queries Section */}
        <SharedDropZone>
          <SharedQuerySection
            folders={filteredSharedFolders}
            queries={filteredSharedQueries}
            foldersByParent={sharedFoldersByParent}
            queriesByFolder={sharedQueriesByFolder}
            onSelectQuery={onSelectQuery}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onRenameQuery={handleRenameQuery}
            onDeleteQuery={handleDeleteQuery}
            onViewQueryHistory={onViewQueryHistory}
            onViewVersionHistory={onViewVersionHistory}
            onLinkQuery={onLinkQuery}
            onUnlinkQuery={onUnlinkQuery}
            onCreateFolder={handleStartSharedCreate}
            onFinishCreate={handleFinishSharedCreate}
            creatingIn={sharedCreatingIn}
            onMoveQueryToFolder={handleMoveQuery}
            onDuplicateToPersonal={handleDuplicateToPersonal}
            allSharedFolders={sharedFolders}
          />
        </SharedDropZone>

        <DragOverlay>
          {draggedQuery ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-popover border border-border rounded-md shadow-lg">
              <CodeFile size={16} className="text-secondary/60 shrink-0" />
              <span className="truncate">{draggedQuery.name}</span>
            </div>
          ) : draggedFolder ? (
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-popover border border-border rounded-md shadow-lg">
              <FolderIcon size={16} className="text-primary/70 shrink-0" />
              <span className="truncate">{draggedFolder.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <ShareConfirmationDialog
        open={shareConfirm !== null}
        onConfirm={handleShareConfirm}
        onCancel={() => setShareConfirm(null)}
        itemName={shareConfirm?.itemName ?? ""}
        itemType={shareConfirm?.itemType ?? "query"}
      />
    </div>
  );
}
