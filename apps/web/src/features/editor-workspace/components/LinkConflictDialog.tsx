import { DiffEditor } from "@monaco-editor/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getEditorOptions,
  MONACO_THEME_NAME,
} from "@/features/editor-workspace/utils/monaco-options";

interface LinkConflictDialogProps {
  isOpen: boolean;
  onClose: () => void;
  localSql: string;
  remoteSql: string;
  qaName: string;
  onResolve: (resolution: "keep-local" | "keep-remote") => void;
  isPending?: boolean;
}

export function LinkConflictDialog({
  isOpen,
  onClose,
  localSql,
  remoteSql,
  qaName,
  onResolve,
  isPending = false,
}: LinkConflictDialogProps) {
  const baseOptions = getEditorOptions();

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && !isPending && onClose()}
    >
      <DialogContent
        className="max-w-3xl bg-card border-border p-0 overflow-hidden"
        onInteractOutside={(e) => isPending && e.preventDefault()}
        onEscapeKeyDown={(e) => isPending && e.preventDefault()}
      >
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-display text-lg font-bold">
            SQL Conflict Detected
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            The SQL in your query differs from the Query Activity &ldquo;
            {qaName}&rdquo; in Automation Studio.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            <span>Automation Studio</span>
            <span>Query++</span>
          </div>
          <div className="h-[400px] border border-border rounded-lg overflow-hidden">
            <DiffEditor
              height="100%"
              language="sql"
              original={remoteSql}
              modified={localSql}
              theme={MONACO_THEME_NAME}
              options={{
                ...baseOptions,
                readOnly: true,
                renderSideBySide: true,
                renderIndicators: true,
                renderOverviewRuler: false,
                renderMarginRevertIcon: false,
                ignoreTrimWhitespace: true,
                originalEditable: false,
                enableSplitViewResizing: false,
                hideUnchangedRegions: { enabled: false },
                minimap: { enabled: false },
                lineNumbers: "on",
                scrollBeyondLastLine: false,
              }}
            />
          </div>
        </div>

        <DialogFooter className="bg-muted/30 px-6 py-4 border-t border-border flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={isPending}
            className="text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onResolve("keep-remote")}
              disabled={isPending}
              className="text-xs font-bold"
            >
              {isPending ? "Linking..." : "Keep AS Version"}
            </Button>
            <Button
              onClick={() => onResolve("keep-local")}
              disabled={isPending}
              className="text-xs font-bold"
            >
              {isPending ? "Linking..." : "Keep Q++ Version"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
