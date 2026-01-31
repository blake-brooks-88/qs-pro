import {
  CUSTOMER_KEY_VALIDATION,
  DE_NAME_VALIDATION,
  FIELD_NAME_VALIDATION,
} from "@qpp/shared-types";
import {
  AddCircle,
  Database,
  InfoCircle,
  TrashBinTrash,
} from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  DataExtensionDraft,
  DataExtensionField,
  Folder,
  SFMCFieldType,
} from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";

interface DataExtensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (data: DataExtensionDraft) => void;
  initialFields?: DataExtensionField[];
  folders?: Folder[];
}

export function DataExtensionModal({
  isOpen,
  onClose,
  onSave,
  initialFields,
  folders,
}: DataExtensionModalProps) {
  const [name, setName] = useState("");
  const [customerKey, setCustomerKey] = useState("");
  const [folderId, setFolderId] = useState("");
  const [isSendable, setIsSendable] = useState(false);
  const [subscriberKeyField, setSubscriberKeyField] = useState("");
  const [fields, setFields] = useState<DataExtensionField[]>([]);

  // Filter folders to only data-extension type
  const defolders = useMemo(
    () => folders?.filter((f) => f.type === "data-extension") ?? [],
    [folders],
  );

  // Filter fields for subscriber key selection (Text or EmailAddress only)
  const subscriberKeyEligibleFields = useMemo(
    () =>
      fields.filter(
        (f) =>
          f.name.trim() !== "" &&
          (f.type === "Text" || f.type === "EmailAddress"),
      ),
    [fields],
  );

  // Initialize fields from initialFields when modal opens
  useEffect(() => {
    if (isOpen && initialFields && initialFields.length > 0) {
      setFields(initialFields);
    }
  }, [isOpen, initialFields]);

  // Reset subscriberKeyField if it no longer references a valid field
  useEffect(() => {
    if (
      subscriberKeyField &&
      !subscriberKeyEligibleFields.some((f) => f.name === subscriberKeyField)
    ) {
      setSubscriberKeyField("");
    }
  }, [subscriberKeyField, subscriberKeyEligibleFields]);

  // Validation helpers
  const isNameValid = useMemo(() => {
    const trimmed = name.trim();
    return (
      trimmed.length > 0 &&
      trimmed.length <= 100 &&
      !trimmed.startsWith("_") &&
      !DE_NAME_VALIDATION.pattern.test(trimmed)
    );
  }, [name]);

  const isCustomerKeyValid = useMemo(() => {
    const trimmed = customerKey.trim();
    return (
      trimmed.length > 0 && trimmed.length <= CUSTOMER_KEY_VALIDATION.maxLength
    );
  }, [customerKey]);

  const isFolderValid = folderId !== "";

  const isSendableValid = useMemo(() => {
    if (!isSendable) {
      return true;
    }
    return subscriberKeyField !== "";
  }, [isSendable, subscriberKeyField]);

  const isFormValid =
    isNameValid && isCustomerKeyValid && isFolderValid && isSendableValid;

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        type: "Text",
        length: undefined,
        isPrimaryKey: false,
        isNullable: true,
      },
    ]);
  };

  const handleUpdateField = (
    index: number,
    updates: Partial<DataExtensionField>,
  ) => {
    setFields((prev) =>
      prev.map((field, idx) =>
        idx === index ? { ...field, ...updates } : field,
      ),
    );
  };

  const handleRemoveField = (index: number) => {
    setFields((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSave = () => {
    if (!isFormValid) {
      return;
    }
    onSave?.({
      name: name.trim(),
      customerKey: customerKey.trim(),
      folderId,
      isSendable,
      subscriberKeyField: isSendable ? subscriberKeyField : undefined,
      fields,
    });
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setName("");
    setCustomerKey("");
    setFolderId("");
    setIsSendable(false);
    setSubscriberKeyField("");
    setFields([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
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

        <div className="space-y-6 py-4">
          {/* Metadata Section */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="de-name"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Name
              </label>
              <input
                id="de-name"
                type="text"
                placeholder="e.g. Master_Subscriber_Feed"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={cn(
                  "w-full bg-muted border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary",
                  name.trim() && !isNameValid
                    ? "border-destructive"
                    : "border-border",
                )}
              />
              {name.trim() && !isNameValid && (
                <p className="text-[10px] text-destructive">
                  {name.trim().startsWith("_")
                    ? "Name cannot start with underscore"
                    : DE_NAME_VALIDATION.pattern.test(name.trim())
                      ? DE_NAME_VALIDATION.message
                      : "Name must be 1-100 characters"}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="de-customer-key"
                className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                Customer Key
              </label>
              <input
                id="de-customer-key"
                type="text"
                placeholder="External ID"
                value={customerKey}
                onChange={(event) => setCustomerKey(event.target.value)}
                className={cn(
                  "w-full bg-muted border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary",
                  customerKey.trim() && !isCustomerKeyValid
                    ? "border-destructive"
                    : "border-border",
                )}
              />
              {customerKey.trim() && !isCustomerKeyValid && (
                <p className="text-[10px] text-destructive">
                  {CUSTOMER_KEY_VALIDATION.message}
                </p>
              )}
            </div>
          </div>

          {/* Folder Picker */}
          <div className="space-y-1.5">
            <label
              htmlFor="de-folder"
              className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            >
              Folder
            </label>
            <select
              id="de-folder"
              value={folderId}
              onChange={(event) => setFolderId(event.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="">Select a folder...</option>
              {defolders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sendable Toggle */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border">
            <div className="flex items-center justify-between">
              <div className="flex gap-3">
                <InfoCircle
                  size={20}
                  className="text-muted-foreground shrink-0"
                />
                <div>
                  <p className="text-xs font-bold text-foreground">
                    Sendable Data Extension
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Enable to use this DE as a sendable audience for email
                    sends.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSendable(!isSendable)}
                className="flex items-center gap-2"
                aria-label="Toggle sendable"
              >
                <span className="text-[10px] font-bold text-muted-foreground uppercase">
                  {isSendable ? "On" : "Off"}
                </span>
                <div
                  className={cn(
                    "w-8 h-4 rounded-full relative transition-colors",
                    isSendable ? "bg-primary" : "bg-muted border border-border",
                  )}
                >
                  <div
                    className={cn(
                      "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                      isSendable
                        ? "left-[18px] bg-white"
                        : "left-0.5 bg-muted-foreground",
                    )}
                  />
                </div>
              </button>
            </div>

            {/* Subscriber Key Field Selection */}
            {isSendable ? (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="space-y-1.5">
                  <label
                    htmlFor="subscriber-key-field"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Subscriber Key Field
                  </label>
                  <select
                    id="subscriber-key-field"
                    value={subscriberKeyField}
                    onChange={(event) =>
                      setSubscriberKeyField(event.target.value)
                    }
                    className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">Select a field...</option>
                    {subscriberKeyEligibleFields.map((f) => (
                      <option key={f.id ?? f.name} value={f.name}>
                        {f.name} ({f.type})
                      </option>
                    ))}
                  </select>
                  {subscriberKeyEligibleFields.length === 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Add a Text or EmailAddress field to enable subscriber key
                      selection.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Fields Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Fields Configuration
              </span>
              <button
                type="button"
                onClick={handleAddField}
                className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary-400 uppercase tracking-widest"
              >
                <AddCircle size={14} /> Add Field
              </button>
            </div>

            <div className="max-h-[240px] overflow-y-auto space-y-2 pr-2">
              {fields.length === 0 ? (
                <div className="text-[11px] text-muted-foreground px-2 py-3 border border-dashed border-border rounded-lg text-center">
                  No fields added yet. Use “Add Field” to define your schema.
                </div>
              ) : (
                fields.map((field, index) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onChange={(updates) => handleUpdateField(index, updates)}
                    onRemove={() => handleRemoveField(index)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Retention Policy */}
          <div className="p-4 rounded-lg bg-muted/50 border border-border flex items-center justify-between">
            <div className="flex gap-3">
              <InfoCircle
                size={20}
                className="text-muted-foreground shrink-0"
              />
              <div>
                <p className="text-xs font-bold text-foreground">
                  Data Retention Policy
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Automatically purge records or entire table after a set
                  period.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                Off
              </span>
              <div className="w-8 h-4 bg-muted border border-border rounded-full relative">
                <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 bg-muted-foreground rounded-full" />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={handleClose}
            className="text-xs font-bold"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isFormValid}
            className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold shadow-lg shadow-primary/20"
          >
            Create Data Extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FieldRowProps {
  field: DataExtensionField;
  onChange: (updates: Partial<DataExtensionField>) => void;
  onRemove: () => void;
}

function FieldRow({ field, onChange, onRemove }: FieldRowProps) {
  const isDecimal = field.type === "Decimal";

  // Validate field name
  const isFieldNameInvalid =
    field.name.trim() !== "" &&
    FIELD_NAME_VALIDATION.pattern.test(field.name.trim());

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-14 gap-2 items-center bg-card p-2 rounded border border-border/50 hover:border-primary/50 transition-colors group">
        <div className="col-span-3">
          <input
            type="text"
            value={field.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Field name"
            className={cn(
              "w-full bg-transparent text-xs focus:outline-none",
              isFieldNameInvalid && "text-destructive",
            )}
          />
        </div>
        <div className="col-span-3">
          <select
            value={field.type}
            onChange={(event) =>
              onChange({
                type: event.target.value as SFMCFieldType,
                scale: undefined,
                precision: undefined,
              })
            }
            className="w-full bg-transparent text-xs focus:outline-none cursor-pointer"
          >
            <option value="Text">Text</option>
            <option value="Number">Number</option>
            <option value="Date">Date</option>
            <option value="Boolean">Boolean</option>
            <option value="Decimal">Decimal</option>
            <option value="EmailAddress">EmailAddress</option>
            <option value="Phone">Phone</option>
          </select>
        </div>
        <div className="col-span-2">
          <input
            type="text"
            value={field.length ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              const numericValue = Number(value);
              onChange({
                length:
                  value && !Number.isNaN(numericValue)
                    ? numericValue
                    : undefined,
              });
            }}
            placeholder="Len"
            className="w-full bg-transparent text-xs text-center focus:outline-none"
          />
        </div>
        <div className="col-span-3">
          <input
            type="text"
            value={field.defaultValue ?? ""}
            onChange={(event) =>
              onChange({
                defaultValue: event.target.value || undefined,
              })
            }
            placeholder="Default"
            className="w-full bg-transparent text-xs focus:outline-none"
          />
        </div>
        <div className="col-span-1 flex justify-center">
          <button
            type="button"
            onClick={() => onChange({ isPrimaryKey: !field.isPrimaryKey })}
            className={cn(
              "w-3.5 h-3.5 rounded-sm border flex items-center justify-center",
              field.isPrimaryKey
                ? "bg-primary border-primary"
                : "border-border",
            )}
            aria-label="Toggle primary key"
          >
            {field.isPrimaryKey ? (
              <div className="w-1.5 h-1.5 bg-white rounded-full" />
            ) : null}
          </button>
        </div>
        <div className="col-span-1 flex justify-center">
          <button
            type="button"
            onClick={() => onChange({ isNullable: !field.isNullable })}
            className={cn(
              "w-3.5 h-3.5 rounded-sm border flex items-center justify-center",
              field.isNullable ? "border-primary" : "border-border",
            )}
            aria-label="Toggle nullable"
          >
            {field.isNullable ? (
              <div className="w-1.5 h-1.5 bg-primary rounded-full" />
            ) : null}
          </button>
        </div>
        <div className="col-span-1 flex justify-end">
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
            aria-label="Remove field"
          >
            <TrashBinTrash size={14} />
          </button>
        </div>
      </div>

      {/* Decimal-specific scale/precision inputs */}
      {isDecimal ? (
        <div className="ml-4 flex items-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <label htmlFor={`precision-${field.id}`}>Precision (1-38):</label>
            <input
              id={`precision-${field.id}`}
              type="number"
              min={1}
              max={38}
              value={field.precision ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const numericValue = Number(value);
                onChange({
                  precision:
                    value && !Number.isNaN(numericValue)
                      ? Math.min(38, Math.max(1, numericValue))
                      : undefined,
                });
              }}
              placeholder="18"
              className="w-14 bg-muted border border-border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor={`scale-${field.id}`}>Scale (0-18):</label>
            <input
              id={`scale-${field.id}`}
              type="number"
              min={0}
              max={18}
              value={field.scale ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const numericValue = Number(value);
                onChange({
                  scale:
                    value && !Number.isNaN(numericValue)
                      ? Math.min(18, Math.max(0, numericValue))
                      : undefined,
                });
              }}
              placeholder="0"
              className="w-14 bg-muted border border-border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      ) : null}

      {/* Field name validation error */}
      {isFieldNameInvalid ? (
        <p className="ml-4 text-[10px] text-destructive">
          {FIELD_NAME_VALIDATION.message}
        </p>
      ) : null}
    </div>
  );
}
