import type { FolderResponse, SavedQueryListItem } from "@qpp/shared-types";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AddFolder,
  AltArrowRight,
  CodeFile,
  Copy,
  Folder as FolderIcon,
  LinkMinimalistic,
  LockKeyhole,
  Pen,
  TrashBinMinimalistic,
  UsersGroupRounded,
} from "@solar-icons/react";
import { useCallback, useState } from "react";

import { PremiumBadge } from "@/components/ui/premium-badge";
import { useFeature } from "@/hooks/use-feature";
import { cn } from "@/lib/utils";

import { getFolderPath } from "../utils/folder-utils";
import { CreatorAttribution } from "./CreatorAttribution";
import { InlineRenameInput } from "./InlineRenameInput";
import { LinkedBadge } from "./LinkedBadge";

function isOptimisticFolderId(folderId: string) {
  return folderId.startsWith("temp-");
}

interface SharedQuerySectionProps {
  folders: FolderResponse[];
  queries: SavedQueryListItem[];
  foldersByParent: Map<string | null, FolderResponse[]>;
  queriesByFolder: Map<string | null, SavedQueryListItem[]>;
  onSelectQuery: (queryId: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameQuery: (id: string, name: string) => void;
  onDeleteQuery: (id: string) => void;
  onViewQueryHistory?: (queryId: string) => void;
  onViewVersionHistory?: (queryId: string) => void;
  onLinkQuery?: (queryId: string) => void;
  onUnlinkQuery?: (queryId: string) => void;
  onCreateFolder: (parentId: string | null) => void;
  onFinishCreate: (name: string | null) => void;
  creatingIn: string | null;
  onMoveQueryToFolder: (queryId: string, folderId: string | null) => void;
  onDuplicateToPersonal?: (queryId: string) => void;
  allSharedFolders: FolderResponse[];
}

interface SharedFolderNodeProps {
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
  onMoveQueryToFolder: (queryId: string, folderId: string | null) => void;
  onDuplicateToPersonal?: (queryId: string) => void;
  allSharedFolders: FolderResponse[];
  readOnly: boolean;
}

interface SharedQueryNodeProps {
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
  allSharedFolders: FolderResponse[];
  onMoveToFolder: (folderId: string | null) => void;
  onDuplicateToPersonal?: () => void;
  readOnly: boolean;
}

function SharedQueryNode({
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
  onLinkQuery,
  onUnlinkQuery,
  allSharedFolders,
  onMoveToFolder,
  onDuplicateToPersonal,
  readOnly,
}: SharedQueryNodeProps) {
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
          onDoubleClick={readOnly ? undefined : onStartRename}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded group transition-colors",
            "text-foreground/80 hover:text-foreground hover:bg-surface-hover",
            readOnly && "opacity-60",
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <CodeFile
            size={16}
            weight="Linear"
            className="text-secondary/60 group-hover:text-secondary shrink-0"
          />
          <span className="truncate">{query.name}</span>
          {readOnly ? (
            <LockKeyhole
              size={12}
              className="text-muted-foreground/50 shrink-0"
            />
          ) : null}
          {query.linkedQaCustomerKey ? (
            <LinkedBadge
              size="sm"
              qaName={query.linkedQaName}
              className="shrink-0"
            />
          ) : null}
          <CreatorAttribution
            creatorName={query.updatedByUserName ?? null}
            updatedAt={query.updatedAt}
          />
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
          {onViewHistory ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onViewHistory}
            >
              View Run History
            </ContextMenu.Item>
          ) : null}
          {onViewVersionHistory ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onViewVersionHistory}
            >
              Version History
            </ContextMenu.Item>
          ) : null}
          {!readOnly && onLinkQuery && !query.linkedQaCustomerKey ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onLinkQuery}
            >
              <LinkMinimalistic size={14} />
              Link to Query Activity
            </ContextMenu.Item>
          ) : null}
          {!readOnly && onUnlinkQuery && query.linkedQaCustomerKey ? (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onUnlinkQuery}
            >
              Unlink from Query Activity
            </ContextMenu.Item>
          ) : null}
          {!readOnly ? (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none">
                <FolderIcon size={14} /> Move to Folder
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="min-w-[200px] max-h-64 overflow-y-auto bg-popover border border-border rounded-md shadow-lg p-1 z-50">
                  {allSharedFolders.map((folder) => (
                    <ContextMenu.Item
                      key={folder.id}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
                      disabled={isOptimisticFolderId(folder.id)}
                      onSelect={() => onMoveToFolder(folder.id)}
                    >
                      <FolderIcon size={14} />{" "}
                      {getFolderPath(allSharedFolders, folder.id) ||
                        folder.name}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          ) : null}
          {onDuplicateToPersonal ? (
            <>
              <ContextMenu.Separator className="h-px bg-border my-1" />
              <ContextMenu.Item
                className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
                onSelect={onDuplicateToPersonal}
              >
                <Copy size={14} />
                Duplicate to Personal
              </ContextMenu.Item>
            </>
          ) : null}
          {!readOnly ? (
            <>
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
            </>
          ) : null}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function SharedFolderNode({
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
  onMoveQueryToFolder,
  onDuplicateToPersonal,
  allSharedFolders,
  readOnly,
}: SharedFolderNodeProps) {
  const isOptimistic = isOptimisticFolderId(folder.id);
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
            onDoubleClick={
              readOnly || isOptimistic
                ? undefined
                : () => onStartRename(`folder-${folder.id}`)
            }
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1 text-xs font-medium",
              "text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer group rounded",
              readOnly && "opacity-60",
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
            {readOnly ? (
              <LockKeyhole
                size={12}
                className="text-muted-foreground/50 shrink-0"
              />
            ) : null}
            <CreatorAttribution
              creatorName={folder.creatorName ?? null}
              updatedAt={folder.updatedAt}
            />
          </button>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
            {!readOnly ? (
              <>
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
              </>
            ) : null}
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
              <SharedFolderNode
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
                onMoveQueryToFolder={onMoveQueryToFolder}
                onDuplicateToPersonal={onDuplicateToPersonal}
                allSharedFolders={allSharedFolders}
                readOnly={readOnly}
              />
            );
          })}
          {childQueries.map((query) => (
            <SharedQueryNode
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
              onLinkQuery={
                onLinkQuery ? () => onLinkQuery(query.id) : undefined
              }
              onUnlinkQuery={
                onUnlinkQuery ? () => onUnlinkQuery(query.id) : undefined
              }
              allSharedFolders={allSharedFolders}
              onMoveToFolder={(folderId) =>
                onMoveQueryToFolder(query.id, folderId)
              }
              onDuplicateToPersonal={
                onDuplicateToPersonal
                  ? () => onDuplicateToPersonal(query.id)
                  : undefined
              }
              readOnly={readOnly}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LockedSharedTeaser() {
  return (
    <div className="px-3 py-4 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <UsersGroupRounded size={20} className="text-muted-foreground/50" />
      </div>
      <p className="text-xs text-muted-foreground/70 leading-relaxed">
        Share queries with your team.
      </p>
      <p className="text-[10px] text-muted-foreground/50 mt-1">
        Upgrade to Enterprise to collaborate.
      </p>
    </div>
  );
}

export function SharedQuerySection({
  folders,
  queries,
  foldersByParent,
  queriesByFolder,
  onSelectQuery,
  onRenameFolder,
  onDeleteFolder,
  onRenameQuery,
  onDeleteQuery,
  onViewQueryHistory,
  onViewVersionHistory,
  onLinkQuery,
  onUnlinkQuery,
  onCreateFolder,
  onFinishCreate,
  creatingIn,
  onMoveQueryToFolder,
  onDuplicateToPersonal,
  allSharedFolders,
}: SharedQuerySectionProps) {
  const { enabled: isTeamCollabEnabled } = useFeature("teamCollaboration");

  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const handleExpandFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: true }));
  }, []);

  const handleCollapseFolder = useCallback((id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: false }));
  }, []);

  const hasSharedContent = folders.length > 0 || queries.length > 0;
  const readOnly = !isTeamCollabEnabled && hasSharedContent;

  const rootFolders = foldersByParent.get(null) ?? [];
  const rootQueries = queriesByFolder.get(null) ?? [];

  const sectionContent = (() => {
    if (!isTeamCollabEnabled && !hasSharedContent) {
      return <LockedSharedTeaser />;
    }

    if (
      rootFolders.length === 0 &&
      rootQueries.length === 0 &&
      creatingIn !== ""
    ) {
      return (
        <div className="px-3 py-3 text-center text-xs text-muted-foreground/70">
          No shared queries yet.
          <br />
          <span className="text-muted-foreground/50">
            Create a new shared folder or drag one here to share with your team.
          </span>
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
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
              onSave={(name) => onFinishCreate(name)}
              onCancel={() => onFinishCreate(null)}
            />
          </div>
        )}
        {rootFolders.map((folder) => {
          const childFolders = foldersByParent.get(folder.id) ?? [];
          const childQueries = queriesByFolder.get(folder.id) ?? [];
          return (
            <SharedFolderNode
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
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameQuery={onRenameQuery}
              onDeleteQuery={onDeleteQuery}
              onViewQueryHistory={onViewQueryHistory}
              onViewVersionHistory={onViewVersionHistory}
              onLinkQuery={onLinkQuery}
              onUnlinkQuery={onUnlinkQuery}
              creatingIn={creatingIn}
              onStartCreate={(parentId) => onCreateFolder(parentId)}
              onFinishCreate={onFinishCreate}
              onMoveQueryToFolder={onMoveQueryToFolder}
              onDuplicateToPersonal={onDuplicateToPersonal}
              allSharedFolders={allSharedFolders}
              readOnly={readOnly}
            />
          );
        })}
        {rootQueries.map((query) => (
          <SharedQueryNode
            key={query.id}
            query={query}
            depth={0}
            onSelect={() => onSelectQuery(query.id)}
            isRenaming={renamingId === `query-${query.id}`}
            onStartRename={() => setRenamingId(`query-${query.id}`)}
            onFinishRename={() => setRenamingId(null)}
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
            onLinkQuery={onLinkQuery ? () => onLinkQuery(query.id) : undefined}
            onUnlinkQuery={
              onUnlinkQuery ? () => onUnlinkQuery(query.id) : undefined
            }
            allSharedFolders={allSharedFolders}
            onMoveToFolder={(folderId) =>
              onMoveQueryToFolder(query.id, folderId)
            }
            onDuplicateToPersonal={
              onDuplicateToPersonal
                ? () => onDuplicateToPersonal(query.id)
                : undefined
            }
            readOnly={readOnly}
          />
        ))}
      </div>
    );
  })();

  return (
    <div className="mt-3 pt-3 border-t border-border/50">
      <div className="flex items-center justify-between px-2 py-1 mb-1">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
        >
          <AltArrowRight
            size={12}
            className={cn("transition-transform", isExpanded && "rotate-90")}
          />
          Shared Queries
        </button>
        <div className="flex items-center gap-1">
          {!isTeamCollabEnabled ? (
            <PremiumBadge
              tier="enterprise"
              size="sm"
              position="inline"
              title="Shared Queries"
              description="Share queries with your team. Everyone in your Business Unit can view and collaborate on shared queries."
            />
          ) : (
            <button
              type="button"
              onClick={() => onCreateFolder(null)}
              className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-surface-hover"
              title="New Shared Folder"
            >
              <AddFolder size={16} />
            </button>
          )}
        </div>
      </div>

      {isExpanded ? sectionContent : null}
    </div>
  );
}

export type { SharedQuerySectionProps };
