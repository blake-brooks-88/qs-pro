import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";

export function VersionHistoryWarningDialog(props: {
  open: boolean;
  onCancel: () => void;
  onContinueWithoutSaving: () => void;
  onSaveAndContinue: () => void;
}) {
  const { open, onCancel, onContinueWithoutSaving, onSaveAndContinue } = props;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent className="max-w-md bg-card border-border p-6">
        <div className="space-y-1">
          <DialogTitle className="text-lg font-bold">
            Unsaved Changes
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
            You have unsaved changes. Would you like to save before viewing
            version history?
          </DialogDescription>
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
            onClick={onContinueWithoutSaving}
            className="text-xs font-bold"
          >
            Continue Without Saving
          </Button>
          <Button onClick={onSaveAndContinue} className="text-xs font-bold">
            Save & Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
