import { InfoCircle } from "@solar-icons/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

import { useRelationshipStore } from "../store/relationship-store";

interface FirstSaveConfirmationProps {
  onConfirmSave: (pending: {
    sourceDE: string;
    sourceColumn: string;
    targetDE: string;
    targetColumn: string;
  }) => void;
}

export function FirstSaveConfirmation({
  onConfirmSave,
}: FirstSaveConfirmationProps) {
  const showFirstSaveDialog = useRelationshipStore(
    (s) => s.showFirstSaveDialog,
  );
  const pendingSave = useRelationshipStore((s) => s.pendingSave);
  const closeFirstSaveDialog = useRelationshipStore(
    (s) => s.closeFirstSaveDialog,
  );

  const handleConfirm = () => {
    if (pendingSave) {
      onConfirmSave(pendingSave);
    }
    closeFirstSaveDialog();
  };

  const handleCancel = () => {
    closeFirstSaveDialog();
  };

  return (
    <Dialog open={showFirstSaveDialog} onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-md bg-card border-border p-6"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-primary/10 text-primary">
            <InfoCircle size={22} weight="Bold" />
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-lg font-bold">
              Save Relationship
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              This will create a small config Data Extension in your Business
              Unit to store your team&apos;s relationship preferences. No data
              leaves your account.
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="bg-primary hover:bg-primary-600 text-white text-xs font-bold px-6 h-10 shadow-lg transition-all active:scale-95"
          >
            Create &amp; Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
