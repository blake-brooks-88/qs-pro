import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AddCircle,
  CloseCircle,
  CodeFile,
  Diskette,
  Pen,
  TrashBinMinimalistic,
} from "@solar-icons/react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import { useTabsStore, type Tab } from "@/store/tabs-store";

import { InlineRenameInput } from "./InlineRenameInput";

interface SortableTabProps {
  tab: Tab;
  isActive: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onClose: () => void;
  onStartRename: () => void;
  onFinishRename: () => void;
  onRename: (name: string) => void;
  onSave: () => void;
  onCloseOthers: () => void;
}

function SortableTab({
  tab,
  isActive,
  isRenaming,
  onSelect,
  onClose,
  onStartRename,
  onFinishRename,
  onRename,
  onSave,
  onCloseOthers,
}: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (isRenaming) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex items-center gap-2 px-3 py-2 border-l-2 bg-background",
          "border-primary",
        )}
      >
        <CodeFile size={14} className="text-secondary/60 shrink-0" />
        <InlineRenameInput
          initialValue={tab.name}
          onSave={onRename}
          onCancel={onFinishRename}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          onClick={onSelect}
          onDoubleClick={onStartRename}
          className={cn(
            "flex items-center gap-2 px-3 py-2 cursor-pointer group border-l-2 transition-colors",
            "hover:bg-surface-hover",
            isActive ? "bg-surface-hover border-primary" : "border-transparent",
            isDragging && "opacity-50",
          )}
        >
          {/* Dirty indicator */}
          {tab.isDirty ? (
            <span
              className="w-2 h-2 rounded-full bg-primary shrink-0"
              data-testid="dirty-indicator"
            />
          ) : (
            <span className="w-2 shrink-0" />
          )}

          <CodeFile
            size={14}
            className={cn(
              "shrink-0",
              isActive ? "text-secondary" : "text-secondary/60",
            )}
          />

          <span
            className={cn(
              "flex-1 text-xs truncate",
              isActive ? "text-foreground font-medium" : "text-foreground/80",
            )}
          >
            {tab.name}
          </span>

          {/* Close button - visible on hover */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={cn(
              "p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity",
              "hover:bg-destructive/10 text-muted-foreground hover:text-destructive",
            )}
            aria-label={`Close ${tab.name}`}
          >
            <CloseCircle size={14} />
          </button>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[160px] bg-popover border border-border rounded-md shadow-lg p-1 z-50">
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
            onSelect={onStartRename}
          >
            <Pen size={14} />
            Rename
          </ContextMenu.Item>
          {tab.isDirty && (
            <ContextMenu.Item
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
              onSelect={onSave}
            >
              <Diskette size={14} />
              Save
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="h-px bg-border my-1" />
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
            onSelect={onClose}
          >
            <CloseCircle size={14} />
            Close
          </ContextMenu.Item>
          <ContextMenu.Item
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded hover:bg-surface-hover cursor-pointer outline-none"
            onSelect={onCloseOthers}
          >
            <TrashBinMinimalistic size={14} />
            Close Others
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

interface QueryTabBarProps {
  onSaveTab?: (tabId: string) => void;
  onCloseWithConfirm?: (tabId: string) => void;
}

export function QueryTabBar({
  onSaveTab,
  onCloseWithConfirm,
}: QueryTabBarProps) {
  const tabs = useTabsStore((state) => state.tabs);
  const activeTabId = useTabsStore((state) => state.activeTabId);
  const setActiveTab = useTabsStore((state) => state.setActiveTab);
  const closeTab = useTabsStore((state) => state.closeTab);
  const createNewTab = useTabsStore((state) => state.createNewTab);
  const renameTab = useTabsStore((state) => state.renameTab);

  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = tabs.findIndex((t) => t.id === active.id);
        const newIndex = tabs.findIndex((t) => t.id === over.id);

        const newTabs = arrayMove(tabs, oldIndex, newIndex);
        useTabsStore.setState({ tabs: newTabs });
      }
    },
    [tabs],
  );

  const handleClose = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (tab?.isDirty && onCloseWithConfirm) {
        onCloseWithConfirm(tabId);
      } else {
        closeTab(tabId);
      }
    },
    [tabs, closeTab, onCloseWithConfirm],
  );

  const handleCloseOthers = useCallback(
    (keepTabId: string) => {
      const otherTabs = tabs.filter((t) => t.id !== keepTabId);
      otherTabs.forEach((t) => {
        if (t.isDirty && onCloseWithConfirm) {
          onCloseWithConfirm(t.id);
        } else {
          closeTab(t.id);
        }
      });
    },
    [tabs, closeTab, onCloseWithConfirm],
  );

  const handleRename = useCallback(
    (tabId: string, name: string) => {
      renameTab(tabId, name);
      setRenamingTabId(null);
    },
    [renameTab],
  );

  if (tabs.length === 0) {
    return (
      <div className="w-48 border-l border-border bg-card flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Open Tabs
          </span>
          <button
            type="button"
            onClick={createNewTab}
            className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-surface-hover"
            title="New Query"
          >
            <AddCircle size={16} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 text-center">
          <span className="text-xs text-muted-foreground">
            No open queries.
            <br />
            <button
              type="button"
              onClick={createNewTab}
              className="text-primary hover:underline mt-1"
            >
              Create new query
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-48 border-l border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          Open Tabs
        </span>
        <button
          type="button"
          onClick={createNewTab}
          className="p-1 text-muted-foreground hover:text-primary rounded hover:bg-surface-hover"
          title="New Query"
        >
          <AddCircle size={16} />
        </button>
      </div>

      {/* Tab list */}
      <div className="flex-1 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabs.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <SortableTab
                key={tab.id}
                tab={tab}
                isActive={tab.id === activeTabId}
                isRenaming={renamingTabId === tab.id}
                onSelect={() => setActiveTab(tab.id)}
                onClose={() => handleClose(tab.id)}
                onStartRename={() => setRenamingTabId(tab.id)}
                onFinishRename={() => setRenamingTabId(null)}
                onRename={(name) => handleRename(tab.id, name)}
                onSave={() => onSaveTab?.(tab.id)}
                onCloseOthers={() => handleCloseOthers(tab.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
