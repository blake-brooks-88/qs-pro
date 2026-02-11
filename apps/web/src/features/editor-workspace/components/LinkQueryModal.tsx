import type { LinkQueryResponse, QAListItem } from "@qpp/shared-types";
import { InfoCircle, LinkMinimalistic, Magnifer } from "@solar-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLinkQuery } from "@/features/editor-workspace/hooks/use-link-query";
import { useQueryActivitiesList } from "@/features/editor-workspace/hooks/use-query-activities-list";
import { cn } from "@/lib/utils";
import { getQueryActivityDetail } from "@/services/query-activities";

import { LinkConflictDialog } from "./LinkConflictDialog";

interface LinkQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedQueryId: string;
  savedQueryName: string;
  currentSql: string;
  onLinkComplete: (linkResponse: LinkQueryResponse) => void;
  onCreateNew: () => void;
}

interface ConflictState {
  qa: QAListItem;
  remoteSql: string;
}

export function LinkQueryModal({
  isOpen,
  onClose,
  savedQueryId,
  savedQueryName,
  currentSql,
  onLinkComplete,
  onCreateNew,
}: LinkQueryModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedQA, setSelectedQA] = useState<QAListItem | null>(null);
  const [conflictState, setConflictState] = useState<ConflictState | null>(
    null,
  );
  const [isConflictDialogOpen, setIsConflictDialogOpen] = useState(false);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { data: queryActivities, isLoading } = useQueryActivitiesList({
    enabled: isOpen,
  });
  const linkMutation = useLinkQuery();

  const filteredActivities = useMemo(() => {
    if (!queryActivities) {
      return [];
    }
    const term = searchTerm.trim().toLowerCase();
    if (!term) {
      return queryActivities;
    }
    return queryActivities.filter((qa) => qa.name.toLowerCase().includes(term));
  }, [queryActivities, searchTerm]);

  function resetState() {
    setSearchTerm("");
    setSelectedQA(null);
    setConflictState(null);
    setIsConflictDialogOpen(false);
    setIsFetchingDetail(false);
    setFetchError(null);
  }

  function handleClose() {
    if (linkMutation.isPending || isFetchingDetail) {
      return;
    }
    resetState();
    onClose();
  }

  async function handleSelectQA(qa: QAListItem) {
    if (qa.isLinked) {
      return;
    }

    setSelectedQA(qa);
    setFetchError(null);
    setIsFetchingDetail(true);

    try {
      const detail = await getQueryActivityDetail(qa.customerKey);
      const localTrimmed = currentSql.trim();
      const remoteTrimmed = (detail.queryText ?? "").trim();

      if (localTrimmed === remoteTrimmed) {
        const response = await linkMutation.mutateAsync({
          savedQueryId,
          qaCustomerKey: qa.customerKey,
        });
        toast.success(`Linked to ${qa.name}`);
        resetState();
        onLinkComplete(response);
      } else {
        setConflictState({ qa, remoteSql: detail.queryText ?? "" });
        setIsConflictDialogOpen(true);
      }
    } catch {
      setFetchError("Failed to fetch Query Activity details. Try again.");
      toast.error("Failed to fetch Query Activity details");
    } finally {
      setIsFetchingDetail(false);
    }
  }

  async function handleConflictResolve(
    resolution: "keep-local" | "keep-remote",
  ) {
    if (!conflictState) {
      return;
    }

    try {
      const response = await linkMutation.mutateAsync({
        savedQueryId,
        qaCustomerKey: conflictState.qa.customerKey,
        conflictResolution: resolution,
      });
      toast.success(`Linked to ${conflictState.qa.name}`);
      setIsConflictDialogOpen(false);
      resetState();
      onLinkComplete(response);
    } catch {
      toast.error("Failed to link query");
    }
  }

  function handleConflictClose() {
    setIsConflictDialogOpen(false);
    setConflictState(null);
    setSelectedQA(null);
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) {
      return "";
    }
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className="max-w-2xl bg-card border-border p-0 overflow-hidden"
          onInteractOutside={(e) =>
            (linkMutation.isPending || isFetchingDetail) && e.preventDefault()
          }
          onEscapeKeyDown={(e) =>
            (linkMutation.isPending || isFetchingDetail) && e.preventDefault()
          }
        >
          <div className="bg-primary/5 px-6 py-8 border-b border-primary/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-inner">
                <LinkMinimalistic
                  size={28}
                  weight="Bold"
                  className="text-primary"
                />
              </div>
              <div className="min-w-0">
                <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                  Link to Query Activity
                </DialogTitle>
                <p className="text-sm text-muted-foreground">
                  Connect &ldquo;{savedQueryName}&rdquo; to an existing
                  Automation Studio Query Activity
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 group">
                <Magnifer
                  size={18}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors"
                />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search Query Activities by name..."
                  className="w-full bg-background border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>
              <button
                onClick={() => {
                  resetState();
                  onCreateNew();
                }}
                className="text-xs text-primary hover:text-primary/80 font-medium transition-colors whitespace-nowrap px-3 py-2.5"
              >
                Create New
              </button>
            </div>

            {fetchError ? (
              <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {fetchError}
              </div>
            ) : null}

            <div className="border border-border rounded-lg max-h-[360px] overflow-y-auto">
              {isLoading ? (
                <div className="px-4 py-12 text-center">
                  <p className="text-sm text-muted-foreground animate-pulse">
                    Loading Query Activities...
                  </p>
                </div>
              ) : filteredActivities.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <InfoCircle
                    size={24}
                    className="mx-auto text-muted-foreground/30 mb-2"
                  />
                  <p className="text-xs text-muted-foreground">
                    {searchTerm.trim()
                      ? "No matching Query Activities found"
                      : "No Query Activities found in this Business Unit"}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredActivities.map((qa) => {
                    const isCurrentlyLinking =
                      selectedQA?.customerKey === qa.customerKey &&
                      (isFetchingDetail || linkMutation.isPending);

                    return (
                      <button
                        key={qa.customerKey}
                        onClick={() => void handleSelectQA(qa)}
                        disabled={
                          qa.isLinked ||
                          isFetchingDetail ||
                          linkMutation.isPending
                        }
                        className={cn(
                          "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors",
                          qa.isLinked
                            ? "opacity-50 cursor-not-allowed bg-muted/30"
                            : "hover:bg-primary/5 cursor-pointer",
                          isCurrentlyLinking && "bg-primary/5",
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold truncate">
                              {qa.name}
                            </p>
                            {isCurrentlyLinking ? (
                              <span className="text-[10px] text-primary font-medium animate-pulse">
                                Linking...
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {qa.targetUpdateType ? (
                              <span className="text-[10px] text-muted-foreground">
                                {qa.targetUpdateType}
                              </span>
                            ) : null}
                            {qa.targetUpdateType && qa.modifiedDate ? (
                              <span className="text-muted-foreground/40">
                                &middot;
                              </span>
                            ) : null}
                            {qa.modifiedDate ? (
                              <span className="text-[10px] text-muted-foreground">
                                {formatDate(qa.modifiedDate)}
                              </span>
                            ) : null}
                          </div>
                          {qa.isLinked && qa.linkedToQueryName ? (
                            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                              Linked to: {qa.linkedToQueryName}
                            </p>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border">
            <Button
              variant="ghost"
              onClick={handleClose}
              disabled={linkMutation.isPending || isFetchingDetail}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {conflictState ? (
        <LinkConflictDialog
          isOpen={isConflictDialogOpen}
          onClose={handleConflictClose}
          localSql={currentSql}
          remoteSql={conflictState.remoteSql}
          qaName={conflictState.qa.name}
          onResolve={(resolution) => void handleConflictResolve(resolution)}
          isPending={linkMutation.isPending}
        />
      ) : null}
    </>
  );
}
