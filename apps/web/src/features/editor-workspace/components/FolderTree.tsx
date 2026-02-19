import { AltArrowRight, Folder as FolderIcon } from "@solar-icons/react";
import { useMemo, useState } from "react";

import type { FolderLike } from "@/features/editor-workspace/utils/folder-utils";
import { cn } from "@/lib/utils";

interface FolderTreeProps {
  folders: FolderLike[];
  selectedId: string | null;
  onSelect: (folderId: string) => void;
  initialExpandedIds?: string[];
  className?: string;
}

const sortByName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

interface FolderTreeNodeProps {
  folder: FolderLike;
  depth: number;
  foldersByParent: Map<string | null, FolderLike[]>;
  selectedId: string | null;
  expandedIds: Set<string>;
  onToggleExpand: (folderId: string) => void;
  onSelect: (folderId: string) => void;
}

function FolderTreeNode({
  folder,
  depth,
  foldersByParent,
  selectedId,
  expandedIds,
  onToggleExpand,
  onSelect,
}: FolderTreeNodeProps) {
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedId === folder.id;
  const childFolders = foldersByParent.get(folder.id) ?? [];
  const hasChildren = childFolders.length > 0;

  return (
    <div role="option" aria-selected={isSelected}>
      <div
        className={cn(
          "flex items-center gap-1 rounded group",
          depth > 0 && "ml-3",
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(folder.id);
            }}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            className="p-1 hover:bg-surface-hover rounded shrink-0"
          >
            <AltArrowRight
              size={14}
              className={cn(
                "transition-transform text-muted-foreground/70",
                isExpanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className={cn(
            "flex-1 flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors text-left",
            isSelected
              ? "bg-primary/10 text-primary font-medium"
              : "text-foreground/80 hover:text-foreground hover:bg-surface-hover",
          )}
        >
          <FolderIcon
            size={16}
            className={cn(
              "shrink-0 transition-colors",
              isSelected
                ? "text-primary"
                : "text-muted-foreground/60 group-hover:text-primary",
            )}
          />
          <span className="truncate">{folder.name}</span>
        </button>
      </div>
      {isExpanded && hasChildren ? (
        <div className="ml-3 border-l border-border/50 pl-1">
          {childFolders.map((child) => (
            <FolderTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              foldersByParent={foldersByParent}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FolderTree({
  folders,
  selectedId,
  onSelect,
  initialExpandedIds,
  className,
}: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(initialExpandedIds),
  );

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, FolderLike[]>();
    folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      const existing = map.get(key) ?? [];
      existing.push(folder);
      map.set(key, existing);
    });
    map.forEach((entries) => entries.sort(sortByName));
    return map;
  }, [folders]);

  const handleToggleExpand = (folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const rootFolders = foldersByParent.get(null) ?? [];

  return (
    <div className={cn("space-y-0.5", className)}>
      {rootFolders.map((folder) => (
        <FolderTreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          foldersByParent={foldersByParent}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
