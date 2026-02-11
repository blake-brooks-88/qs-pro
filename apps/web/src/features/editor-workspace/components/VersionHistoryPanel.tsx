import type { VersionListItem } from "@qpp/shared-types";
import { CloseSquare, Export, RestartCircle } from "@solar-icons/react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { LockedOverlay } from "@/components/ui/locked-overlay";
import { useFeature } from "@/hooks/use-feature";
import { cn } from "@/lib/utils";

import {
  useQueryVersions,
  useRestoreVersion,
  useUpdateVersionName,
  useVersionDetail,
} from "../hooks/use-query-versions";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { VersionDiffViewer } from "./VersionDiffViewer";
import { VersionTimeline } from "./VersionTimeline";

interface VersionHistoryPanelProps {
  savedQueryId: string;
  queryName: string;
  onClose: () => void;
  onRestore: (sqlText: string) => void;
  onUpgradeClick: () => void;
  onPublishVersion?: (versionId: string) => void;
  isLinked?: boolean;
}

function findPreviousVersionId(
  versions: VersionListItem[],
  selectedVersionId: string,
): string | undefined {
  const sorted = [...versions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const selectedIndex = sorted.findIndex((v) => v.id === selectedVersionId);
  if (selectedIndex === -1 || selectedIndex >= sorted.length - 1) {
    return undefined;
  }
  return sorted.at(selectedIndex + 1)?.id;
}

function formatVersionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function VersionHistoryPanel({
  savedQueryId,
  queryName,
  onClose,
  onRestore,
  onUpgradeClick,
  onPublishVersion,
  isLinked,
}: VersionHistoryPanelProps) {
  const { enabled: hasAccess } = useFeature("versionHistory");
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );
  const [showChanges, setShowChanges] = useState(true);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);

  const { data: versionData, isLoading: isLoadingVersions } = useQueryVersions(
    hasAccess ? savedQueryId : undefined,
  );
  const versions = useMemo(
    () => versionData?.versions ?? [],
    [versionData?.versions],
  );

  const effectiveSelectedId = useMemo(() => {
    if (selectedVersionId && versions.some((v) => v.id === selectedVersionId)) {
      return selectedVersionId;
    }
    if (versions.length === 0) {
      return null;
    }
    const sorted = [...versions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return sorted.at(0)?.id ?? null;
  }, [selectedVersionId, versions]);

  const previousVersionId = useMemo(() => {
    if (!effectiveSelectedId) {
      return undefined;
    }
    return findPreviousVersionId(versions, effectiveSelectedId);
  }, [versions, effectiveSelectedId]);

  const { data: selectedDetail } = useVersionDetail(
    hasAccess ? savedQueryId : undefined,
    effectiveSelectedId ?? undefined,
  );
  const { data: previousDetail } = useVersionDetail(
    hasAccess ? savedQueryId : undefined,
    previousVersionId,
  );

  const restoreMutation = useRestoreVersion();
  const updateNameMutation = useUpdateVersionName();

  const handleSelectVersion = useCallback((versionId: string) => {
    setSelectedVersionId(versionId);
  }, []);

  const handleUpdateName = useCallback(
    (versionId: string, name: string | null) => {
      updateNameMutation.mutate(
        {
          savedQueryId,
          versionId,
          data: { versionName: name },
        },
        {
          onError: () => {
            toast.error("Failed to update version name");
          },
        },
      );
    },
    [updateNameMutation, savedQueryId],
  );

  const handleToggleShowChanges = useCallback(() => {
    setShowChanges((prev) => !prev);
  }, []);

  const latestVersionId = useMemo(() => {
    if (versions.length === 0) {
      return null;
    }
    const sorted = [...versions].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return sorted.at(0)?.id ?? null;
  }, [versions]);

  const isViewingLatest = effectiveSelectedId === latestVersionId;

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === effectiveSelectedId),
    [versions, effectiveSelectedId],
  );

  const handleRestoreConfirm = useCallback(() => {
    if (!effectiveSelectedId || !selectedDetail) {
      return;
    }

    restoreMutation.mutate(
      { savedQueryId, versionId: effectiveSelectedId },
      {
        onSuccess: () => {
          toast.success("Version restored");
          onRestore(selectedDetail.sqlText);
          onClose();
        },
        onError: () => {
          toast.error("Failed to restore version");
        },
      },
    );
  }, [
    effectiveSelectedId,
    selectedDetail,
    restoreMutation,
    savedQueryId,
    onRestore,
    onClose,
  ]);

  const panelContent = (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-sm font-semibold truncate">{queryName}</h2>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            Version History
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleShowChanges}
            className="flex items-center gap-2 group"
          >
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              Show Changes
            </span>
            <div
              className={cn(
                "relative w-7 h-4 rounded-full transition-colors",
                showChanges ? "bg-muted-foreground" : "bg-muted-foreground/30",
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform",
                  showChanges ? "translate-x-3.5" : "translate-x-0.5",
                )}
              />
            </div>
          </button>
          {effectiveSelectedId && versions.length > 0 ? (
            <>
              {isLinked && onPublishVersion ? (
                <Button
                  onClick={() => onPublishVersion(effectiveSelectedId)}
                  size="sm"
                  variant="outline"
                  className="text-[11px] h-7 gap-1.5 px-2.5"
                >
                  <Export size={14} />
                  Publish
                </Button>
              ) : null}
              <Button
                onClick={() => setIsRestoreDialogOpen(true)}
                disabled={isViewingLatest || restoreMutation.isPending}
                size="sm"
                variant="default"
                className="text-[11px] h-7 gap-1.5 px-2.5"
              >
                <RestartCircle size={14} />
                {restoreMutation.isPending
                  ? "Restoring..."
                  : "Restore this version"}
              </Button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close version history"
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            <CloseSquare size={18} weight="Bold" />
          </button>
        </div>
      </div>

      {/* Main content: diff viewer + timeline sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* Diff viewer area */}
        <div className="flex-1 min-w-0">
          {isLoadingVersions ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading versions...
            </div>
          ) : versions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              No versions available
            </div>
          ) : selectedDetail ? (
            <VersionDiffViewer
              currentSql={selectedDetail.sqlText}
              previousSql={previousDetail?.sqlText ?? null}
              showChanges={showChanges}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Select a version to view
            </div>
          )}
        </div>

        {/* Timeline sidebar */}
        <div className="w-80 min-w-64 border-l border-border flex flex-col bg-card">
          <div className="flex-1 min-h-0 overflow-y-auto">
            <VersionTimeline
              versions={versions}
              selectedVersionId={effectiveSelectedId}
              onSelectVersion={handleSelectVersion}
              onUpdateName={handleUpdateName}
            />
          </div>
        </div>
      </div>

      {/* Restore confirmation dialog */}
      <ConfirmationDialog
        isOpen={isRestoreDialogOpen}
        title="Restore version"
        description={`Restore to version from ${selectedVersion ? formatVersionDate(selectedVersion.createdAt) : ""}? This creates a new version with the old content.`}
        confirmLabel="Restore"
        cancelLabel="Cancel"
        variant="info"
        onClose={() => setIsRestoreDialogOpen(false)}
        onConfirm={handleRestoreConfirm}
      />
    </div>
  );

  if (!hasAccess) {
    return (
      <LockedOverlay
        locked
        variant="panel"
        tier="pro"
        title="Unlock Version History"
        description="Track every change, compare versions, and restore with one click."
        ctaLabel="Upgrade to Pro"
        onCtaClick={onUpgradeClick}
      >
        {panelContent}
      </LockedOverlay>
    );
  }

  return panelContent;
}
