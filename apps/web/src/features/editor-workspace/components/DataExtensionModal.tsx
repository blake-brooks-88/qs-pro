import { Database } from "@solar-icons/react";
import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DataExtension,
  DataExtensionDraft,
  DataExtensionField,
  Folder,
} from "@/features/editor-workspace/types";

import { DataExtensionForm } from "./DataExtensionForm";

interface DataExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: DataExtensionDraft) => Promise<void> | void;
  initialFields?: DataExtensionField[];
  folders?: Folder[];
  dataExtensions?: DataExtension[];
}

export function DataExtensionModal({
  isOpen,
  onClose,
  onSave,
  initialFields,
  folders,
  dataExtensions,
}: DataExtensionModalProps) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (draft: DataExtensionDraft) => {
    if (!onSave) {
      return;
    }
    setIsSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch {
      // Error handled upstream (toast). Keep modal open.
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
              <Database size={24} weight="Bold" className="text-primary" />
            </div>
            <div>
              <DialogTitle className="font-display text-xl font-bold">
                Create Data Extension
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Define a new target table in Marketing Cloud
              </p>
            </div>
          </div>
        </DialogHeader>

        <DataExtensionForm
          initialFields={initialFields}
          folders={folders}
          dataExtensions={dataExtensions}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isSubmitting={isSaving}
        />
      </DialogContent>
    </Dialog>
  );
}
