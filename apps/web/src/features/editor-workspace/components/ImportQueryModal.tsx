import type { QAListItem } from "@qpp/shared-types";
import {
  AltArrowLeft,
  Folder as FolderIcon,
  Import,
  InfoCircle,
  LockKeyhole,
  Magnifer,
} from "@solar-icons/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFolders } from "@/features/editor-workspace/hooks/use-folders";
import { useQueryActivitiesList } from "@/features/editor-workspace/hooks/use-query-activities-list";
import { useCreateSavedQuery } from "@/features/editor-workspace/hooks/use-saved-queries";
import { useTier } from "@/hooks/use-tier";
import { cn } from "@/lib/utils";
import { getQueryActivityDetail } from "@/services/query-activities";

interface ImportQueryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSaved: (queryId: string, name: string, sqlText: string) => void;
  onOpenInEditor: (sqlText: string, qaName: string) => void;
}

export function ImportQueryModal({
  isOpen,
  onClose,
  onImportSaved,
  onOpenInEditor,
}: ImportQueryModalProps) {
  const [step, setStep] = useState<"browse" | "configure">("browse");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedQA, setSelectedQA] = useState<QAListItem | null>(null);
  const [fetchedSql, setFetchedSql] = useState<string | null>(null);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);

  const { data: queryActivities, isLoading } = useQueryActivitiesList({
    enabled: isOpen,
  });
  const createQuery = useCreateSavedQuery();
  const { data: folders = [] } = useFolders({
    enabled: isOpen && step === "configure",
  });
  const { tier } = useTier();
  const foldersEnabled = tier !== "free";

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
    setStep("browse");
    setSearchTerm("");
    setSelectedQA(null);
    setFetchedSql(null);
    setIsFetchingDetail(false);
    setFetchError(null);
    setImportName("");
    setFolderId(null);
  }

  function handleClose() {
    if (isFetchingDetail || createQuery.isPending) {
      return;
    }
    resetState();
    onClose();
  }

  async function handleSelectQA(qa: QAListItem) {
    setSelectedQA(qa);
    setFetchedSql(null);
    setFetchError(null);
    setIsFetchingDetail(true);

    try {
      const detail = await getQueryActivityDetail(qa.customerKey);
      setFetchedSql(detail.queryText ?? "");
      setImportName(qa.name);
    } catch {
      setFetchError("Failed to fetch Query Activity details. Try again.");
      toast.error("Failed to fetch Query Activity details");
    } finally {
      setIsFetchingDetail(false);
    }
  }

  function handleOpenInEditor() {
    if (!fetchedSql || !selectedQA) {
      return;
    }
    onOpenInEditor(fetchedSql, selectedQA.name);
    toast.success(`Opened "${selectedQA.name}" in editor`);
    resetState();
    onClose();
  }

  function handleGoToConfigure() {
    setStep("configure");
  }

  function handleBackToBrowse() {
    setStep("browse");
    setImportName(selectedQA?.name ?? "");
    setFolderId(null);
  }

  async function handleImport() {
    if (!fetchedSql || !importName.trim()) {
      return;
    }

    try {
      const savedQuery = await createQuery.mutateAsync({
        name: importName.trim(),
        sqlText: fetchedSql,
        folderId: foldersEnabled ? folderId : null,
      });
      onImportSaved(savedQuery.id, savedQuery.name, fetchedSql);
      toast.success(`Imported "${savedQuery.name}" as saved query`);
      resetState();
      onClose();
    } catch (error) {
      toast.error("Failed to import query", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="max-w-2xl bg-card border-border p-0 overflow-hidden"
        onInteractOutside={(e) =>
          (isFetchingDetail || createQuery.isPending) && e.preventDefault()
        }
        onEscapeKeyDown={(e) =>
          (isFetchingDetail || createQuery.isPending) && e.preventDefault()
        }
      >
        <div className="bg-primary/5 px-6 py-8 border-b border-primary/10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shadow-inner">
              <Import size={28} weight="Bold" className="text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-2xl font-bold tracking-tight">
                {step === "browse"
                  ? "Import from Automation Studio"
                  : "Configure Import"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {step === "browse"
                  ? "Browse Query Activities in your Business Unit and import their SQL"
                  : `Import "${selectedQA?.name}" as a saved query`}
              </p>
            </div>
          </div>
        </div>

        {step === "browse" ? (
          <>
            <div className="p-6 space-y-4">
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
                      const isSelected =
                        selectedQA?.customerKey === qa.customerKey;
                      const isCurrentlyFetching =
                        isSelected && isFetchingDetail;

                      return (
                        <button
                          key={qa.customerKey}
                          onClick={() => void handleSelectQA(qa)}
                          disabled={isFetchingDetail || createQuery.isPending}
                          className={cn(
                            "w-full text-left px-4 py-3 flex items-center gap-3 transition-colors",
                            isSelected
                              ? "bg-primary/5 ring-1 ring-primary/20"
                              : "hover:bg-primary/5 cursor-pointer",
                            (isFetchingDetail || createQuery.isPending) &&
                              !isSelected &&
                              "opacity-50",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">
                                {qa.name}
                              </p>
                              {isCurrentlyFetching ? (
                                <span className="text-[10px] text-primary font-medium animate-pulse">
                                  Fetching...
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {qa.targetDEName ? (
                                <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                  {qa.targetDEName}
                                </span>
                              ) : null}
                              {qa.targetDEName && qa.targetUpdateType ? (
                                <span className="text-muted-foreground/40">
                                  &middot;
                                </span>
                              ) : null}
                              {qa.targetUpdateType ? (
                                <span className="text-[10px] text-muted-foreground">
                                  {qa.targetUpdateType}
                                </span>
                              ) : null}
                              {(qa.targetDEName || qa.targetUpdateType) &&
                              qa.modifiedDate ? (
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
                disabled={isFetchingDetail}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              {selectedQA && fetchedSql !== null ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={handleOpenInEditor}
                    className="text-xs font-bold"
                  >
                    Open in Editor
                  </Button>
                  <Button
                    onClick={handleGoToConfigure}
                    className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-primary/20 transition-all active:scale-95"
                  >
                    Import as Saved Query
                  </Button>
                </div>
              ) : null}
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="p-6 space-y-5">
              <button
                onClick={handleBackToBrowse}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <AltArrowLeft size={14} />
                Back to browse
              </button>

              <div className="space-y-1.5">
                <label
                  htmlFor="import-query-name"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Query Name
                </label>
                <input
                  id="import-query-name"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                  placeholder="e.g. Weekly Active Subscribers"
                  className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="import-query-folder"
                  className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
                >
                  Target Folder
                </label>
                {foldersEnabled ? (
                  <div className="relative">
                    <FolderIcon
                      size={18}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                    />
                    <select
                      id="import-query-folder"
                      value={folderId ?? ""}
                      onChange={(e) => setFolderId(e.target.value || null)}
                      className="w-full bg-muted/50 border border-border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all appearance-none cursor-pointer"
                    >
                      <option value="">No folder</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id}>
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground">
                    <LockKeyhole size={14} className="text-muted-foreground" />
                    <span>Folders available in Pro</span>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/50 text-[11px] text-muted-foreground">
                <InfoCircle size={16} className="shrink-0 mt-0.5" />
                <p>
                  Importing creates a new saved query in your workspace. It does
                  not link to or modify the original Query Activity.
                </p>
              </div>
            </div>

            <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={createQuery.isPending}
                className="text-xs font-bold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </Button>
              <Button
                disabled={!importName.trim() || createQuery.isPending}
                onClick={() => void handleImport()}
                className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
              >
                {createQuery.isPending ? "Importing..." : "Import"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
