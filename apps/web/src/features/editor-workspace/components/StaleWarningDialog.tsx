import { Danger } from "@solar-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

interface StaleWarningDialogProps {
  open: boolean;
  conflictingUserName: string | null;
  onOverwrite: () => void;
  onReload: () => void;
  onCancel: () => void;
}

export function StaleWarningDialog({
  open,
  conflictingUserName,
  onOverwrite,
  onReload,
  onCancel,
}: StaleWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-md bg-card border-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-warning/10 text-warning">
            <Danger size={22} weight="Bold" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-lg font-bold">
              Query modified by another user
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {conflictingUserName
                ? `${conflictingUserName} modified this query since you opened it.`
                : "Another user modified this query since you opened it."}{" "}
              What would you like to do?
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onReload}
            className="text-xs font-bold"
          >
            Reload Their Changes
          </Button>
          <Button
            onClick={onOverwrite}
            className="bg-warning hover:bg-warning-600 text-white text-xs font-bold px-6 h-10 shadow-lg transition-all active:scale-95"
          >
            Overwrite with Mine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
