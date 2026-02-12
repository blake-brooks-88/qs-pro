import {
  AltArrowLeft,
  AltArrowRight,
  CodeFile,
  Database,
  Folder as FolderIcon,
} from "@solar-icons/react";
import Fuse from "fuse.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { QuotaCountBadge } from "@/components/QuotaGate";
import { useDataExtensionFields } from "@/features/editor-workspace/hooks/use-metadata";
import { useActivityBarStore } from "@/features/editor-workspace/store/activity-bar-store";
import type {
  DataExtension,
  Folder,
  SavedQuery,
} from "@/features/editor-workspace/types";
import { useRunUsage } from "@/hooks/use-run-usage";
import { useTier, WARNING_THRESHOLD } from "@/hooks/use-tier";
import { cn } from "@/lib/utils";

import { getFolderAncestors, getFolderPath } from "../utils/folder-utils";
import { QueryTreeView } from "./QueryTreeView";
import {
  SidebarSearch,
  SidebarSearchResultItem,
  SidebarSearchResults,
  SidebarSearchRoot,
} from "./SidebarSearch";

interface WorkspaceSidebarProps {
  activeView: "dataExtensions" | "queries";
  tenantId?: string | null;
  folders: Folder[];
  savedQueries?: SavedQuery[];
  dataExtensions: DataExtension[];
  isDataExtensionsFetching?: boolean;
  onSelectQuery?: (id: string) => void;
  onSelectDE?: (id: string) => void;
  onCreateDE?: () => void;
  onCreateFolder?: (parentId: string | null) => void;
  onViewQueryHistory?: (queryId: string) => void;
  onViewVersionHistory?: (queryId: string) => void;
  onLinkQuery?: (queryId: string) => void;
  onUnlinkQuery?: (queryId: string) => void;
}

interface DataExtensionNodeProps {
  dataExtension: DataExtension;
  depth: number;
  isExpanded: boolean;
  isSelected?: boolean;
  onToggle: (id: string) => void;
  onSelectDE?: (id: string) => void;
  tenantId?: string | null;
}

const sortByName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

const VIEW_TITLES = new Map<WorkspaceSidebarProps["activeView"], string>([
  ["dataExtensions", "Data Extensions"],
  ["queries", "Queries"],
]);

function DataExtensionNode({
  dataExtension,
  depth,
  isExpanded,
  isSelected,
  onToggle,
  onSelectDE,
  tenantId,
}: DataExtensionNodeProps) {
  const fieldsQuery = useDataExtensionFields({
    tenantId,
    customerKey: dataExtension.customerKey,
    enabled: isExpanded,
  });

  const hasFields = (fieldsQuery.data?.length ?? 0) > 0;

  return (
    <div className="space-y-1">
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => {
          onToggle(dataExtension.id);
          onSelectDE?.(dataExtension.id);
        }}
        title={dataExtension.name}
        className={cn(
          "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded group transition-colors",
          depth > 0 && "ml-2",
          isSelected
            ? "bg-surface-hover text-foreground font-medium"
            : "text-foreground/80 hover:text-foreground hover:bg-surface-hover",
        )}
      >
        <AltArrowRight
          size={14}
          className={cn(
            "transition-transform text-muted-foreground/70 shrink-0",
            isExpanded ? "rotate-90" : "",
            isSelected && "text-foreground/70",
          )}
        />
        <Database
          size={16}
          weight="Linear"
          className={cn(
            "shrink-0 transition-colors",
            isSelected
              ? "text-foreground"
              : "text-primary/60 group-hover:text-primary",
          )}
        />
        <span className="truncate">{dataExtension.name}</span>
        {fieldsQuery.isFetching ? (
          <span className="ml-auto h-4 w-4 animate-spin rounded-full border border-muted-foreground/40 border-t-transparent shrink-0" />
        ) : null}
      </button>
      {isExpanded ? (
        <div className="ml-6 border-l border-border/50 pl-3 space-y-1">
          {fieldsQuery.isFetching ? (
            <div className="text-xs text-muted-foreground">
              Loading fields...
            </div>
          ) : hasFields ? (
            fieldsQuery.data?.map((field) => (
              <div
                key={field.name}
                title={field.name}
                className="flex items-center justify-between gap-2 text-xs text-foreground/80"
              >
                <span className="truncate">{field.name}</span>
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {field.type}
                </span>
              </div>
            ))
          ) : (
            <div className="text-xs text-muted-foreground">
              No fields found.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Helper function to toggle expanded state for a DataExtension ID.
 *
 * ESLINT-DISABLE JUSTIFICATION:
 * This eslint-disable is an exception to project standards, not a pattern to follow.
 *
 * Why this is safe: `id` is the DataExtension.id property passed from the
 * DataExtensionNode component's onToggle callback. The DataExtension interface
 * (defined in types.ts) types `id` as a string. This value originates from
 * MCE API responses and is used as a key in the expandedDeIds state object
 * (Record<string, boolean>). User input cannot inject arbitrary values because
 * the id comes from iterating over typed DataExtension objects.
 *
 * Why not refactor: Converting to Map would break React's state update pattern
 * for object spreading. The Record<string, boolean> pattern is idiomatic for
 * tracking expanded/collapsed state in tree components.
 */
function toggleExpandedDeId(
  prev: Record<string, boolean>,
  id: string,
): Record<string, boolean> {
  /* eslint-disable security/detect-object-injection */
  return { ...prev, [id]: !prev[id] };
  /* eslint-enable security/detect-object-injection */
}

export function WorkspaceSidebar({
  activeView,
  tenantId,
  folders,
  savedQueries = [],
  dataExtensions,
  isDataExtensionsFetching = false,
  onSelectQuery,
  onSelectDE,
  onCreateFolder,
  onViewQueryHistory,
  onViewVersionHistory,
  onLinkQuery,
  onUnlinkQuery,
}: WorkspaceSidebarProps) {
  const setActiveView = useActivityBarStore((s) => s.setActiveView);
  const { tier } = useTier();
  const { data: usageData } = useRunUsage();

  const [expandedFolderIds, setExpandedFolderIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedDeIds, setExpandedDeIds] = useState<Record<string, boolean>>(
    {},
  );

  // Resize logic
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem("workspace-sidebar-width");
    return saved ? parseInt(saved, 10) : 256;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 600) {
          setWidth(newWidth);
          localStorage.setItem("workspace-sidebar-width", newWidth.toString());
        }
      }
    },
    [isResizing],
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [focusedItemType, setFocusedItemType] = useState<
    "de" | "query" | "folder" | null
  >(null);
  const [preSearchExpandedFolders, setPreSearchExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [preSearchExpandedDEs, setPreSearchExpandedDEs] = useState<
    Record<string, boolean>
  >({});
  const [activeIndex, setActiveIndex] = useState(-1);

  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    folders.forEach((folder) => {
      const key = folder.parentId ?? null;
      const existing = map.get(key) ?? [];
      existing.push(folder);
      map.set(key, existing);
    });
    map.forEach((entries) => entries.sort(sortByName));
    return map;
  }, [folders]);

  const dataExtensionsByFolder = useMemo(() => {
    const map = new Map<string | null, DataExtension[]>();
    dataExtensions.forEach((dataExtension) => {
      const key = dataExtension.folderId || null;
      const existing = map.get(key) ?? [];
      existing.push(dataExtension);
      map.set(key, existing);
    });
    map.forEach((entries) => entries.sort(sortByName));
    return map;
  }, [dataExtensions]);

  // Search results with Fuse.js
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    if (activeView === "dataExtensions") {
      const data = [
        ...folders.map((f) => ({ ...f, searchType: "folder" as const })),
        ...dataExtensions.map((de) => ({ ...de, searchType: "de" as const })),
      ];

      const fuse = new Fuse(data, {
        keys: ["name"],
        threshold: 0.35,
        location: 0,
        distance: 100,
        minMatchCharLength: 1,
      });

      return fuse
        .search(searchQuery)
        .map((result) => ({
          id: result.item.id,
          name: result.item.name,
          type: result.item.searchType,
          path: getFolderPath(
            folders,
            result.item.searchType === "folder"
              ? (result.item as Folder).parentId
              : (result.item as DataExtension).folderId,
          ),
        }))
        .slice(0, 50);
    }
    const fuse = new Fuse(savedQueries, {
      keys: ["name"],
      threshold: 0.35,
    });

    return fuse
      .search(searchQuery)
      .map((result) => ({
        id: result.item.id,
        name: result.item.name,
        type: "query" as const,
        path: getFolderPath(folders, result.item.folderId),
      }))
      .slice(0, 50);
  }, [activeView, searchQuery, folders, dataExtensions, savedQueries]);

  const handleSelectResult = (id: string, type: "de" | "query" | "folder") => {
    if (!focusedItemId) {
      setPreSearchExpandedFolders(expandedFolderIds);
      setPreSearchExpandedDEs(expandedDeIds);
    }

    setFocusedItemId(id);
    setFocusedItemType(type);
    setSearchQuery("");
    setIsSearchOpen(false);
    setActiveIndex(-1);

    const newExpandedFolders = { ...expandedFolderIds };

    let folderIdToResolve: string | null = null;
    if (type === "de") {
      const de = dataExtensions.find((d) => d.id === id);
      folderIdToResolve = de?.folderId ?? null;
      setExpandedDeIds((prev) => ({ ...prev, [id]: true }));
    } else if (type === "query") {
      const q = savedQueries.find((query) => query.id === id);
      folderIdToResolve = q?.folderId ?? null;
    } else {
      folderIdToResolve = id;
    }

    if (folderIdToResolve) {
      const ancestors = getFolderAncestors(folders, folderIdToResolve);
      ancestors.forEach((f) => {
        newExpandedFolders[f.id] = true;
      });
    }
    setExpandedFolderIds(newExpandedFolders);

    if (type === "query") {
      onSelectQuery?.(id);
    } else if (type === "de") {
      onSelectDE?.(id);
    }
  };

  const handleClearSearch = () => {
    setFocusedItemId(null);
    setFocusedItemType(null);
    setSearchQuery("");
    setActiveIndex(-1);
    setExpandedFolderIds(preSearchExpandedFolders);
    setExpandedDeIds(preSearchExpandedDEs);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSearchOpen || searchResults.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + searchResults.length) % searchResults.length,
      );
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      /**
       * ESLINT-DISABLE JUSTIFICATION:
       * This eslint-disable is an exception to project standards, not a pattern to follow.
       *
       * Why this is safe: `activeIndex` is a numeric state variable that is only modified
       * through controlled setActiveIndex calls. The condition `activeIndex >= 0` on line 350
       * ensures the index is non-negative, and `searchResults.length === 0` check on line 340
       * ensures the array is not empty. The modulo operations in ArrowUp/ArrowDown handlers
       * (lines 344, 347-348) bound the index to valid array positions. User keyboard input
       * only triggers state updates through these controlled handlers.
       *
       * Why not refactor: Using Array.at() would require additional null checks and wouldn't
       * improve safety since the index is already bounds-checked. This is a standard React
       * pattern for keyboard-navigable lists where the index state is controlled.
       */
      // eslint-disable-next-line security/detect-object-injection
      const result = searchResults[activeIndex];
      if (!result) {
        return;
      }
      handleSelectResult(result.id, result.type);
    } else if (e.key === "Escape") {
      setIsSearchOpen(false);
      setActiveIndex(-1);
    }
  };

  const isVisible = (id: string, type: "folder" | "de" | "query") => {
    if (!focusedItemId) {
      return true;
    }

    if (type === "folder") {
      if (focusedItemId === id && focusedItemType === "folder") {
        return true;
      }

      let targetFolderId: string | null = null;
      if (focusedItemType === "de") {
        targetFolderId =
          dataExtensions.find((de) => de.id === focusedItemId)?.folderId ??
          null;
      } else if (focusedItemType === "query") {
        targetFolderId =
          savedQueries.find((q) => q.id === focusedItemId)?.folderId ?? null;
      } else {
        targetFolderId = focusedItemId;
      }

      if (targetFolderId) {
        const ancestors = getFolderAncestors(folders, targetFolderId);
        return ancestors.some((a) => a.id === id);
      }
      return false;
    }

    return focusedItemId === id && focusedItemType === type;
  };

  const renderFolderNode = (folder: Folder, depth: number) => {
    if (!isVisible(folder.id, "folder")) {
      return null;
    }

    const isExpanded = Boolean(expandedFolderIds[folder.id]);
    const childFolders = foldersByParent.get(folder.id) ?? [];
    const childDataExtensions = dataExtensionsByFolder.get(folder.id) ?? [];

    return (
      <div key={folder.id} className="space-y-1">
        <button
          type="button"
          aria-expanded={isExpanded}
          onClick={() =>
            setExpandedFolderIds((prev) => ({
              ...prev,
              [folder.id]: !prev[folder.id],
            }))
          }
          title={folder.name}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-hover cursor-pointer group rounded",
            depth > 0 && "ml-2",
          )}
        >
          <AltArrowRight
            size={14}
            className={cn(
              "transition-transform text-muted-foreground/70 shrink-0",
              isExpanded ? "rotate-90" : "",
            )}
          />
          <FolderIcon
            size={16}
            className="text-muted-foreground/60 group-hover:text-primary transition-colors shrink-0"
          />
          <span className="truncate">{folder.name}</span>
          {isDataExtensionsFetching && isExpanded ? (
            <span className="ml-auto h-4 w-4 animate-spin rounded-full border border-muted-foreground/40 border-t-transparent shrink-0" />
          ) : null}
        </button>
        {isExpanded ? (
          <div className="ml-3 border-l border-border/50 pl-2 space-y-1">
            {childFolders.map((child) => renderFolderNode(child, depth + 1))}
            {childDataExtensions
              .filter((de) => isVisible(de.id, "de"))
              .map((dataExtension) => (
                <DataExtensionNode
                  key={dataExtension.id}
                  dataExtension={dataExtension}
                  depth={depth + 1}
                  isExpanded={Boolean(expandedDeIds[dataExtension.id])}
                  isSelected={focusedItemId === dataExtension.id}
                  onToggle={(id) =>
                    setExpandedDeIds((prev) => toggleExpandedDeId(prev, id))
                  }
                  onSelectDE={onSelectDE}
                  tenantId={tenantId}
                />
              ))}
          </div>
        ) : null}
      </div>
    );
  };

  const rootFolders = foldersByParent.get(null) ?? [];
  const rootDataExtensions = dataExtensionsByFolder.get(null) ?? [];

  const showSearch = true;

  return (
    <div
      ref={sidebarRef}
      style={{ width: `${width}px` }}
      className="relative border-r border-border bg-background flex flex-col shrink-0 animate-fade-in group/sidebar"
    >
      {/* Resizer handle */}
      <button
        type="button"
        aria-label="Resize sidebar"
        onMouseDown={startResizing}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            setWidth((w) => Math.max(200, w - 10));
          }
          if (e.key === "ArrowRight") {
            setWidth((w) => Math.min(600, w + 10));
          }
        }}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors z-50"
      />

      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border bg-card px-3 py-2.5">
        <span className="text-xs font-bold uppercase tracking-widest text-foreground">
          {VIEW_TITLES.get(activeView)}
        </span>
        <button
          onClick={() => setActiveView(null)}
          className="text-muted-foreground hover:text-foreground shrink-0"
        >
          <AltArrowLeft size={18} />
        </button>
      </div>

      {/* Search Bar (DE and Queries views only) */}
      {showSearch ? (
        <div className="p-2 border-b border-border/50 bg-muted/20">
          <SidebarSearchRoot onOpenChange={setIsSearchOpen}>
            <SidebarSearch
              placeholder={
                activeView === "dataExtensions"
                  ? "Search Data Extensions..."
                  : "Search Queries..."
              }
              density="compact"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsSearchOpen(true);
                setActiveIndex(-1);
              }}
              onFocus={() => setIsSearchOpen(true)}
              onKeyDown={handleKeyDown}
              onClear={handleClearSearch}
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Empty string means "no active search"
              showClear={Boolean(focusedItemId || searchQuery)}
            />
            <SidebarSearchResults
              isOpen={isSearchOpen ? searchResults.length > 0 : false}
            >
              {searchResults.map((result, idx) => (
                <SidebarSearchResultItem
                  key={`${result.type}-${result.id}`}
                  active={idx === activeIndex}
                  onClick={() => handleSelectResult(result.id, result.type)}
                  onMouseEnter={() => setActiveIndex(idx)}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      {result.type === "de" && (
                        <Database
                          size={14}
                          className="text-primary/70 shrink-0"
                        />
                      )}
                      {result.type === "folder" && (
                        <FolderIcon
                          size={14}
                          className="text-muted-foreground/70 shrink-0"
                        />
                      )}
                      {result.type === "query" && (
                        <CodeFile
                          size={14}
                          className="text-secondary/70 shrink-0"
                        />
                      )}
                      <span className="font-medium truncate">
                        {result.name}
                      </span>
                    </div>
                    {result.path ? (
                      <span className="text-xs opacity-70 text-muted-foreground truncate pl-5">
                        {result.path}
                      </span>
                    ) : null}
                  </div>
                </SidebarSearchResultItem>
              ))}
            </SidebarSearchResults>
          </SidebarSearchRoot>
        </div>
      ) : null}

      {/* Tree Content (DE and Queries views) */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {activeView === "dataExtensions" && (
            <>
              <div className="flex items-center justify-between px-2 py-1 mb-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Data Extensions
                </span>
              </div>
              {rootFolders.map((folder) => renderFolderNode(folder, 0))}
              {rootDataExtensions
                .filter((de) => isVisible(de.id, "de"))
                .map((dataExtension) => (
                  <DataExtensionNode
                    key={dataExtension.id}
                    dataExtension={dataExtension}
                    depth={0}
                    isExpanded={Boolean(expandedDeIds[dataExtension.id])}
                    isSelected={focusedItemId === dataExtension.id}
                    onToggle={(id) =>
                      setExpandedDeIds((prev) => toggleExpandedDeId(prev, id))
                    }
                    onSelectDE={onSelectDE}
                    tenantId={tenantId}
                  />
                ))}
            </>
          )}

          {activeView === "queries" && (
            <QueryTreeView
              searchQuery={searchQuery}
              onSelectQuery={(queryId) => onSelectQuery?.(queryId)}
              onCreateFolder={() => onCreateFolder?.(null)}
              onViewQueryHistory={onViewQueryHistory}
              onViewVersionHistory={onViewVersionHistory}
              onLinkQuery={onLinkQuery}
              onUnlinkQuery={onUnlinkQuery}
            />
          )}
        </div>
      </div>

      {/* Sidebar Footer - Usage Badge */}
      {tier === "free" && usageData && usageData.queryRuns.limit !== null ? (
        <div className="border-t border-border p-3 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Runs</span>
            <QuotaCountBadge
              current={usageData.queryRuns.current}
              limit={usageData.queryRuns.limit}
              resourceName="Query Runs"
            />
          </div>
          {usageData.queryRuns.current >=
            usageData.queryRuns.limit * WARNING_THRESHOLD && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Resets{" "}
              {new Date(usageData.queryRuns.resetDate).toLocaleDateString(
                "en-US",
                { month: "long", day: "numeric" },
              )}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
