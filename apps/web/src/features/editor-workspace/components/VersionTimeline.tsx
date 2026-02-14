import type { PublishEventListItem, VersionListItem } from "@qpp/shared-types";
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
  currentPublishedVersionId?: string | null;
  publishedVersionIds?: Set<string>;
  publishEventsByVersionId?: Map<string, PublishEventListItem[]>;
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
  defaultDisplay: string;
  onSave: (versionId: string, name: string | null) => void;
}

function InlineEditableName({
  versionId,
  currentName,
  defaultDisplay,
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
        placeholder={defaultDisplay}
        className="w-full px-1.5 py-0.5 text-xs bg-background rounded outline-none ring-1 ring-border focus:ring-primary/40"
        aria-label="Version name"
      />
    );
  }

  if (currentName) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={handleStartEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleStartEdit();
          }
        }}
        className="w-full text-xs font-medium text-foreground truncate text-left hover:underline cursor-text block"
        title={currentName}
      >
        {currentName}
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleStartEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleStartEdit();
        }
      }}
      className="w-full text-xs text-muted-foreground truncate text-left hover:underline cursor-text block"
    >
      {defaultDisplay}
    </span>
  );
}

interface PublishBadgeProps {
  events: PublishEventListItem[];
  isCurrent: boolean;
}

function PublishBadge({ events, isCurrent }: PublishBadgeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = events.length;
  const label = isCurrent
    ? count > 1
      ? `published ${String(count)}x`
      : "published"
    : count > 1
      ? `published ${String(count)}x`
      : "was published";

  return (
    <div className="relative">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
        className={cn(
          "text-[10px] font-medium px-1.5 py-0.5 rounded-full cursor-pointer",
          isCurrent
            ? "bg-success-500/10 text-success-600 dark:text-success-400"
            : "bg-muted text-muted-foreground",
        )}
      >
        {label}
      </span>
      {isExpanded && count > 0 ? (
        <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-md shadow-lg p-2 min-w-40">
          <div className="text-[10px] text-muted-foreground space-y-1">
            {events.map((event) => (
              <div key={event.id}>
                {new Date(event.createdAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function VersionTimeline({
  versions,
  selectedVersionId,
  onSelectVersion,
  onUpdateName,
  currentPublishedVersionId,
  publishedVersionIds,
  publishEventsByVersionId,
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
    <div className="flex flex-col overflow-y-auto py-3 px-3">
      {sorted.map((version, index) => {
        const isSelected = version.id === selectedVersionId;
        const delta = computeLineCountDelta(sorted, index);
        const isRestore = version.source === "restore";
        const isCurrentPublished = version.id === currentPublishedVersionId;
        const wasPreviouslyPublished =
          !isCurrentPublished &&
          (publishedVersionIds?.has(version.id) ?? false);
        const versionPublishEvents = publishEventsByVersionId?.get(version.id);

        return (
          <div key={version.id} className="relative pl-8 pb-4 last:pb-0 group">
            {index < sorted.length - 1 && (
              <div className="absolute left-3 top-3 bottom-0 w-px bg-border" />
            )}

            <div
              className={cn(
                "absolute left-0 top-1 w-6 h-6 rounded-full border-2 bg-card flex items-center justify-center transition-all",
                isSelected
                  ? "border-primary shadow-[0_0_10px_hsl(var(--primary)/0.3)]"
                  : "border-muted-foreground/30 group-hover:border-muted-foreground/60",
              )}
            >
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full bg-primary transition-all",
                  isSelected ? "opacity-100 scale-100" : "opacity-0 scale-0",
                )}
              />
            </div>

            {isCurrentPublished ? (
              <div
                className="absolute left-4 top-4 w-2.5 h-2.5 rounded-full bg-success-500 animate-publish-pulse z-10"
                aria-label="Currently published"
              />
            ) : wasPreviouslyPublished ? (
              <div
                className="absolute left-4 top-4 w-2.5 h-2.5 rounded-full bg-muted-foreground/50 z-10"
                aria-label="Previously published"
              />
            ) : null}

            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelectVersion(version.id)}
              onKeyDown={(e) => {
                if (
                  e.currentTarget === e.target &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  onSelectVersion(version.id);
                }
              }}
              className={cn(
                "w-full text-left rounded-lg border p-3 transition-all cursor-pointer",
                isSelected
                  ? "bg-muted border-primary/30"
                  : "border-border/50 hover:bg-muted/30 hover:border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1 min-h-5">
                  <InlineEditableName
                    versionId={version.id}
                    currentName={version.versionName}
                    defaultDisplay={formatTimestamp(version.createdAt)}
                    onSave={onUpdateName}
                  />
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isRestore ? (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      restored
                    </span>
                  ) : null}
                  {versionPublishEvents && versionPublishEvents.length > 0 ? (
                    <PublishBadge
                      events={versionPublishEvents}
                      isCurrent={isCurrentPublished}
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-1.5 mt-1.5">
                {version.authorName ? (
                  <>
                    <svg
                      className="w-3 h-3 text-muted-foreground/60 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="8" r="4" />
                      <path d="M20 21a8 8 0 0 0-16 0" />
                    </svg>
                    <span className="text-[10px] text-muted-foreground/60 truncate">
                      {version.authorName}
                    </span>
                  </>
                ) : null}
                {delta ? (
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded",
                      delta.startsWith("+")
                        ? "text-green-500 bg-green-500/10"
                        : "text-red-500 bg-red-500/10",
                    )}
                  >
                    {delta} lines
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
