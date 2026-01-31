import {
  Diskette,
  Folder as FolderIcon,
  InfoCircle,
  LockKeyhole,
} from "@solar-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { QuotaGate } from "@/components/QuotaGate";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFolders } from "@/features/editor-workspace/hooks/use-folders";
import {
  useCreateSavedQuery,
  useSavedQueries,
  useSavedQueryCount,
} from "@/features/editor-workspace/hooks/use-saved-queries";
import { useSavedQueryLimit, useTier } from "@/hooks/use-tier";

interface SaveQueryModalProps {
  isOpen: boolean;
  /** SQL content to save */
  content: string;
  initialName?: string;
  initialFolderId?: string;
  onClose: () => void;
  /** Called after successful save with the new query ID and name */
  onSaveSuccess?: (queryId: string, name: string) => void;
  /**
   * Legacy callback for backwards compatibility.
   * @deprecated Use onSaveSuccess instead
   */
  onSave?: (name: string, folderId: string) => void;
}

export function SaveQueryModal({
  isOpen,
  content,
  initialName = "",
  initialFolderId,
  onClose,
  onSaveSuccess,
  onSave,
}: SaveQueryModalProps) {
  const [name, setName] = useState(initialName);
  const [folderId, setFolderId] = useState<string | null>(
    initialFolderId ?? null,
  );

  // Quota and tier hooks
  const { data: queryCount = 0 } = useSavedQueryCount({ enabled: isOpen });
  const queryLimit = useSavedQueryLimit();
  const { tier } = useTier();
  const foldersEnabled = tier !== "free"; // Folders are Pro+ only

  // Folder data
  const { data: folders = [] } = useFolders({ enabled: isOpen });

  // Saved queries for duplicate name detection
  const { data: queries = [] } = useSavedQueries({ enabled: isOpen });

  // Mutation
  const createQuery = useCreateSavedQuery();

  // Duplicate name check (case-insensitive)
  const isDuplicateName = queries.some(
    (q) => q.name.toLowerCase() === name.trim().toLowerCase(),
  );

  // Reset form when modal opens with new initial values
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setFolderId(initialFolderId ?? null);
    }
  }, [isOpen, initialName, initialFolderId]);

  const handleSave = async () => {
    if (!name.trim()) {
      return;
    }

    try {
      const query = await createQuery.mutateAsync({
        name: name.trim(),
        sqlText: content,
        folderId: foldersEnabled ? folderId : null,
      });

      toast.success("Query saved", {
        description: `"${query.name}" has been saved to your workspace.`,
      });

      onSaveSuccess?.(query.id, query.name);
      // Only call legacy onSave if onSaveSuccess is NOT provided
      if (!onSaveSuccess) {
        onSave?.(name.trim(), folderId ?? "");
      }
      onClose();
    } catch (error) {
      toast.error("Failed to save query", {
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-card border-border p-0 overflow-hidden">
        <div className="bg-primary/5 px-6 py-6 border-b border-primary/10">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center shadow-inner">
              <Diskette size={24} weight="Bold" className="text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold tracking-tight">
                Save Query
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Save this query to your personal or shared library.
              </DialogDescription>
            </div>
          </div>
        </div>

        <QuotaGate
          current={queryCount}
          limit={queryLimit}
          resourceName="Saved Queries"
          showCount
          className="p-6"
        >
          <div className="space-y-5">
            <div className="space-y-1.5">
              <label
                htmlFor="query-name"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground ml-1"
              >
                Query Name
              </label>
              <input
                id="query-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Weekly Active Subscribers"
                className="w-full bg-muted/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              />
              {isDuplicateName ? (
                <p className="text-xs text-amber-500 mt-1.5 flex items-center gap-1">
                  <InfoCircle size={12} />A query with this name already exists
                </p>
              ) : null}
            </div>

            {/* Folder selector - Pro+ only */}
            <div className="space-y-1.5">
              <label
                htmlFor="query-folder"
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
                    id="query-folder"
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
                Saving to your workspace makes this query available for reuse
                and collaboration. It does not affect any existing Automation
                Studio activities.
              </p>
            </div>
          </div>

          <DialogFooter className="bg-muted/30 -mx-6 px-6 py-4 -mb-6 mt-6 border-t border-border">
            <Button
              variant="ghost"
              onClick={onClose}
              className="text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || createQuery.isPending}
              onClick={() => void handleSave()}
              className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold px-6 h-10 shadow-lg shadow-primary/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {createQuery.isPending ? "Saving..." : "Save to Workspace"}
            </Button>
          </DialogFooter>
        </QuotaGate>
      </DialogContent>
    </Dialog>
  );
}
