import { ConfirmationDialog } from "./ConfirmationDialog";

interface ShareConfirmationDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  itemName: string;
  itemType: "folder" | "query";
}

export function ShareConfirmationDialog({
  open,
  onConfirm,
  onCancel,
  itemName,
  itemType,
}: ShareConfirmationDialogProps) {
  const description =
    itemType === "folder"
      ? `Everyone in this BU will be able to view and edit all queries in "${itemName}". This cannot be undone.`
      : `Everyone in this BU will be able to view and edit "${itemName}". This cannot be undone.`;

  return (
    <ConfirmationDialog
      isOpen={open}
      title={`Share "${itemName}" with your team?`}
      description={description}
      confirmLabel="Share"
      variant="info"
      onClose={onCancel}
      onConfirm={onConfirm}
    />
  );
}
