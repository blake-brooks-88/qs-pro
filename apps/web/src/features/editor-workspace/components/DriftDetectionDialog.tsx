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

interface DriftDetectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  localSql: string;
  remoteSql: string;
  qaName: string;
  onKeepMine: () => void;
  onAcceptTheirs: () => void;
  isPending: boolean;
}

export function DriftDetectionDialog({
  isOpen,
  onClose,
  localSql,
  remoteSql,
  qaName,
  onKeepMine,
  onAcceptTheirs,
  isPending,
}: DriftDetectionDialogProps) {
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
            SQL Drift Detected
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            The SQL in Automation Studio differs from your latest saved version
            of &ldquo;{qaName}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            <span>Automation Studio</span>
            <span>Your Version</span>
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
              onClick={onAcceptTheirs}
              disabled={isPending}
              className="text-xs font-bold"
            >
              {isPending ? "Updating..." : "Accept Theirs"}
            </Button>
            <Button
              onClick={onKeepMine}
              disabled={isPending}
              className="text-xs font-bold"
            >
              {isPending ? "Publishing..." : "Keep Mine"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
