import { Dialog, DialogContent, DialogFooter, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Danger, InfoCircle } from '@solar-icons/react';

interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onClose: () => void;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'warning',
  onClose,
  onConfirm,
}: ConfirmationDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md bg-card border-border p-6">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            variant === 'danger' ? 'bg-error/10 text-error' : 
            variant === 'warning' ? 'bg-warning/10 text-warning' : 
            'bg-primary/10 text-primary'
          }`}>
            {variant === 'info' ? <InfoCircle size={22} weight="Bold" /> : <Danger size={22} weight="Bold" />}
          </div>
          <div className="space-y-1">
            <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {description}
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="mt-6 gap-2">
          <Button variant="ghost" onClick={onClose} className="text-xs font-bold">
            {cancelLabel}
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`${
              variant === 'danger' ? 'bg-error hover:bg-error-600' : 
              variant === 'warning' ? 'bg-warning hover:bg-warning-600' : 
              'bg-primary hover:bg-primary-600'
            } text-white text-xs font-bold px-6 h-10 shadow-lg transition-all active:scale-95`}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
