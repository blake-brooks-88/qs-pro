import type { VersionListItem } from "@qpp/shared-types";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

interface VersionTimelineProps {
  versions: VersionListItem[];
  selectedVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  onUpdateName: (versionId: string, name: string | null) => void;
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatFullTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function computeLineCountDelta(
  versions: VersionListItem[],
  index: number,
): string | null {
  if (index >= versions.length - 1) {
    return null;
  }
  const current = versions.at(index);
  const previous = versions.at(index + 1);
  if (!current || !previous) {
    return null;
  }
  const delta = current.lineCount - previous.lineCount;
  if (delta === 0) {
    return null;
  }
  return delta > 0 ? `+${String(delta)}` : String(delta);
}

interface InlineEditableNameProps {
  versionId: string;
  currentName: string | null;
  isSelected: boolean;
  onSave: (versionId: string, name: string | null) => void;
}

function InlineEditableName({
  versionId,
  currentName,
  isSelected,
  onSave,
}: InlineEditableNameProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentName ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    setEditValue(currentName ?? "");
    setIsEditing(true);
  }, [currentName]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    const newName = trimmed.length > 0 ? trimmed : null;
    if (newName !== currentName) {
      onSave(versionId, newName);
    }
    setIsEditing(false);
  }, [editValue, currentName, onSave, versionId]);

  const handleCancel = useCallback(() => {
    setEditValue(currentName ?? "");
    setIsEditing(false);
  }, [currentName]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancel();
      }
    },
    [handleSave, handleCancel],
  );

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        maxLength={255}
        className="w-full px-1.5 py-0.5 text-xs bg-background border border-border rounded outline-none focus:ring-1 focus:ring-primary/40"
        aria-label="Version name"
      />
    );
  }

  if (currentName) {
    return (
      <button
        type="button"
        onClick={handleStartEdit}
        className="text-xs font-medium text-foreground truncate text-left hover:underline cursor-text max-w-full"
        title={currentName}
      >
        {currentName}
      </button>
    );
  }

  if (isSelected) {
    return (
      <button
        type="button"
        onClick={handleStartEdit}
        className="text-[10px] text-muted-foreground/70 hover:text-muted-foreground transition-colors italic"
      >
        Name this version
      </button>
    );
  }

  return null;
}

export function VersionTimeline({
  versions,
  selectedVersionId,
  onSelectVersion,
  onUpdateName,
}: VersionTimelineProps) {
  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        No versions yet
      </div>
    );
  }

  const sorted = [...versions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto py-1">
      {sorted.map((version, index) => {
        const isSelected = version.id === selectedVersionId;
        const delta = computeLineCountDelta(sorted, index);
        const isRestore = version.source === "restore";

        return (
          <button
            key={version.id}
            type="button"
            onClick={() => onSelectVersion(version.id)}
            className={cn(
              "flex flex-col gap-0.5 px-3 py-2 text-left rounded-md transition-colors cursor-pointer",
              "hover:bg-muted/50",
              isSelected && "bg-primary/10 border-l-2 border-primary",
            )}
          >
            <div className="flex items-center gap-2">
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span className="text-xs text-muted-foreground whitespace-nowrap cursor-default">
                    {formatTimestamp(version.createdAt)}
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="bg-foreground text-background text-[10px] px-2 py-1 rounded shadow-md z-50"
                    sideOffset={5}
                  >
                    {formatFullTimestamp(version.createdAt)}
                    <Tooltip.Arrow className="fill-foreground" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              {delta ? (
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    delta.startsWith("+") ? "text-green-500" : "text-red-500",
                  )}
                >
                  {delta} lines
                </span>
              ) : null}

              {isRestore ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  restored
                </span>
              ) : null}
            </div>

            {/* Prevent click from bubbling to parent button when editing name */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- wrapper prevents parent button click during inline name editing; keyboard is handled by the input inside */}
            <div className="min-h-[16px]" onClick={(e) => e.stopPropagation()}>
              <InlineEditableName
                versionId={version.id}
                currentName={version.versionName}
                isSelected={isSelected}
                onSave={onUpdateName}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
