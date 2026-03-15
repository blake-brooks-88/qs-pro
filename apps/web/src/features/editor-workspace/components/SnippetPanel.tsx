import type { SnippetListItem, SnippetScope } from "@qpp/shared-types";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { AddSquare, AltArrowLeft, CodeFile } from "@solar-icons/react";
import Fuse from "fuse.js";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { FeatureGate } from "@/components/FeatureGate";
import type { BuiltInSnippet } from "@/features/editor-workspace/constants/built-in-snippets";
import { BUILT_IN_SNIPPETS } from "@/features/editor-workspace/constants/built-in-snippets";
import {
  useDeleteSnippet,
  useSnippets,
} from "@/features/editor-workspace/hooks/use-snippets";
import { useActivityBarStore } from "@/features/editor-workspace/store/activity-bar-store";
import { useFeature } from "@/hooks/use-feature";
import { cn } from "@/lib/utils";

import { ConfirmationDialog } from "./ConfirmationDialog";
import { SidebarSearch } from "./SidebarSearch";
import type { SnippetModalProps } from "./SnippetModal";
import { SnippetModal } from "./SnippetModal";

interface SnippetPanelProps {
  onInsertSnippet?: (snippetBody: string) => void;
  snippetModalState?: Pick<SnippetModalProps, "open" | "mode" | "initialData" | "snippetId"> | null;
  onOpenCreateModal?: () => void;
  onOpenEditModal?: (snippetId: string, data: SnippetModalProps["initialData"]) => void;
  onOpenDuplicateModal?: (data: SnippetModalProps["initialData"]) => void;
  onSnippetModalOpenChange?: (open: boolean) => void;
}

type UserSnippetItem = SnippetListItem & { isBuiltin: false };
type BuiltInSnippetItem = BuiltInSnippet & { isBuiltin: true };
type AnySnippet = UserSnippetItem | BuiltInSnippetItem;

function stripTabStops(body: string): string {
  return body.replace(/\$\{\d+:([^}]*)\}/g, "$1").replace(/\$\d+/g, "");
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-3 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

export function SnippetPanel({
  onInsertSnippet,
  snippetModalState,
  onOpenCreateModal,
  onOpenEditModal,
  onOpenDuplicateModal,
  onSnippetModalOpenChange,
}: SnippetPanelProps) {
  const setActiveView = useActivityBarStore((s) => s.setActiveView);
  const { enabled: isTeamSnippetsEnabled } = useFeature("teamSnippets");

  const { data: userSnippets = [] } = useSnippets();
  const deleteSnippet = useDeleteSnippet();

  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem("workspace-sidebar-width");
    return saved ? parseInt(saved, 10) : 256;
  });
  const [isResizing, setIsResizing] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

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
          localStorage.setItem(
            "workspace-sidebar-width",
            newWidth.toString(),
          );
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

  const visibleBuiltIns = useMemo<BuiltInSnippetItem[]>(() => {
    const source = isTeamSnippetsEnabled
      ? BUILT_IN_SNIPPETS
      : BUILT_IN_SNIPPETS.filter((s) => s.category === "free");
    return source.map((s) => ({ ...s, isBuiltin: true as const }));
  }, [isTeamSnippetsEnabled]);

  const userSnippetItems = useMemo<UserSnippetItem[]>(
    () => userSnippets.map((s) => ({ ...s, isBuiltin: false as const })),
    [userSnippets],
  );

  const allSnippets = useMemo<AnySnippet[]>(
    () => [...userSnippetItems, ...visibleBuiltIns],
    [userSnippetItems, visibleBuiltIns],
  );

  const filteredSnippets = useMemo<AnySnippet[]>(() => {
    if (!searchQuery.trim()) {
      return allSnippets;
    }
    const fuse = new Fuse(allSnippets, {
      keys: ["title", "triggerPrefix", "description"],
      threshold: 0.35,
    });
    return fuse.search(searchQuery).map((r) => r.item);
  }, [allSnippets, searchQuery]);

  const filteredUserSnippets = useMemo(
    () =>
      filteredSnippets.filter((s): s is UserSnippetItem => !s.isBuiltin),
    [filteredSnippets],
  );
  const filteredBuiltInSnippets = useMemo(
    () =>
      filteredSnippets.filter((s): s is BuiltInSnippetItem => s.isBuiltin),
    [filteredSnippets],
  );

  const selectedSnippet = useMemo(
    () => allSnippets.find((s) => s.id === selectedSnippetId) ?? null,
    [allSnippets, selectedSnippetId],
  );

  const handleSingleClick = useCallback((id: string) => {
    setSelectedSnippetId(id);
  }, []);

  const handleDoubleClick = useCallback(
    (body: string) => {
      onInsertSnippet?.(body);
    },
    [onInsertSnippet],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (deleteTarget) {
      deleteSnippet.mutate(deleteTarget.id);
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteSnippet]);

  const selectedPreview = useMemo(() => {
    if (!selectedSnippet) return null;
    if (selectedSnippet.isBuiltin) {
      return stripTabStops(selectedSnippet.body);
    }
    return selectedSnippet.code;
  }, [selectedSnippet]);

  return (
    <>
      <div
        style={{ width: `${width}px` }}
        className="relative border-r border-border bg-background flex flex-col shrink-0 animate-fade-in"
      >
        {/* Resize handle */}
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
            Snippets
          </span>
          <button
            onClick={() => setActiveView(null)}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <AltArrowLeft size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-2 border-b border-border/50 bg-muted/20">
          <SidebarSearch
            placeholder="Search snippets..."
            density="compact"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery("")}
            showClear={Boolean(searchQuery)}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto flex flex-col" style={{ minHeight: 0 }}>
          {/* My Snippets Section */}
          <SectionHeader>My Snippets</SectionHeader>

          <FeatureGate feature="teamSnippets" variant="panel">
            {filteredUserSnippets.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">
                No snippets yet
              </div>
            ) : (
              <div className="px-1 space-y-0.5">
                {filteredUserSnippets.map((snippet) => (
                  <UserSnippetRow
                    key={snippet.id}
                    snippet={snippet}
                    isSelected={selectedSnippetId === snippet.id}
                    onClick={() => handleSingleClick(snippet.id)}
                    onDoubleClick={() => handleDoubleClick(snippet.code)}
                    onDelete={(id, title) => setDeleteTarget({ id, title })}
                    onEdit={(id, data) => onOpenEditModal?.(id, data)}
                  />
                ))}
              </div>
            )}
          </FeatureGate>

          {/* Built-in Section */}
          <SectionHeader>Built-in</SectionHeader>

          <div className="px-1 space-y-0.5">
            {filteredBuiltInSnippets.map((snippet) => (
              <BuiltInSnippetRow
                key={snippet.id}
                snippet={snippet}
                isSelected={selectedSnippetId === snippet.id}
                onClick={() => handleSingleClick(snippet.id)}
                onDoubleClick={() => handleDoubleClick(snippet.body)}
                onDuplicate={(data) => onOpenDuplicateModal?.(data)}
              />
            ))}
          </div>

          {/* Code preview */}
          {selectedPreview ? (
            <div className="mt-3 mx-2 mb-2 shrink-0">
              <pre className="rounded border border-border bg-muted/30 p-2 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
                {selectedPreview}
              </pre>
            </div>
          ) : null}
        </div>

        {/* Footer: New Snippet button (Pro only) */}
        {isTeamSnippetsEnabled ? (
          <div className="border-t border-border p-2">
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
            >
              <AddSquare size={14} />
              New Snippet
            </button>
          </div>
        ) : null}
      </div>

      {/* Delete confirmation */}
      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        title="Delete Snippet"
        description={`Are you sure you want to delete "${deleteTarget?.title ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
      />

      {/* Snippet create/edit/duplicate modal */}
      {snippetModalState ? (
        <SnippetModal
          open={snippetModalState.open}
          onOpenChange={onSnippetModalOpenChange ?? (() => {})}
          mode={snippetModalState.mode}
          initialData={snippetModalState.initialData}
          snippetId={snippetModalState.snippetId}
        />
      ) : null}
    </>
  );
}

function UserSnippetRow({
  snippet,
  isSelected,
  onClick,
  onDoubleClick,
  onDelete,
  onEdit,
}: {
  snippet: UserSnippetItem;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDelete: (id: string, title: string) => void;
  onEdit: (id: string, data: { title: string; triggerPrefix: string; code: string; description?: string; scope: SnippetScope }) => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded group transition-colors text-left",
            isSelected
              ? "bg-surface-hover text-foreground font-medium"
              : "text-foreground/80 hover:text-foreground hover:bg-surface-hover",
          )}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          title={snippet.description ?? snippet.title}
        >
          <CodeFile
            size={14}
            className="shrink-0 text-primary/60 group-hover:text-primary"
          />
          <span className="font-mono text-xs text-primary shrink-0">
            {snippet.triggerPrefix}
          </span>
          <span className="truncate">{snippet.title}</span>
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[140px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
            onSelect={() =>
              onEdit(snippet.id, {
                title: snippet.title,
                triggerPrefix: snippet.triggerPrefix,
                code: snippet.code,
                description: snippet.description ?? undefined,
                scope: snippet.scope,
              })
            }
          >
            Edit
          </ContextMenu.Item>
          <ContextMenu.Separator className="h-px bg-border my-1" />
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none text-destructive"
            onSelect={() => onDelete(snippet.id, snippet.title)}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function BuiltInSnippetRow({
  snippet,
  isSelected,
  onClick,
  onDoubleClick,
  onDuplicate,
}: {
  snippet: BuiltInSnippetItem;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDuplicate: (data: { title: string; triggerPrefix: string; code: string; description?: string }) => void;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          type="button"
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded group transition-colors text-left",
            isSelected
              ? "bg-surface-hover text-foreground font-medium"
              : "text-foreground/80 hover:text-foreground hover:bg-surface-hover",
          )}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          title={snippet.description}
        >
          <CodeFile
            size={14}
            className="shrink-0 text-muted-foreground/60 group-hover:text-primary/70"
          />
          <span className="font-mono text-xs text-primary/80 shrink-0">
            {snippet.triggerPrefix}
          </span>
          <span className="truncate">{snippet.title}</span>
          {snippet.category === "pro" ? (
            <span className="ml-auto shrink-0 text-[9px] font-bold uppercase text-primary/50 bg-primary/10 px-1 rounded">
              pro
            </span>
          ) : null}
        </button>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[140px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
            onSelect={() =>
              onDuplicate({
                title: `${snippet.title} (copy)`,
                triggerPrefix: snippet.triggerPrefix,
                code: snippet.body,
                description: snippet.description,
              })
            }
          >
            Duplicate
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
