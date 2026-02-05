import {
  CreateDataExtensionSchema,
  type DataRetentionPolicy,
  FIELD_NAME_VALIDATION,
} from "@qpp/shared-types";
import { AddCircle, InfoCircle, TrashBinTrash } from "@solar-icons/react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  DataExtension,
  DataExtensionDraft,
  DataExtensionField,
  Folder,
  SFMCFieldType,
} from "@/features/editor-workspace/types";
import { cn } from "@/lib/utils";

import { FolderTreePicker } from "./FolderTreePicker";

const YYYY_MM_DD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const getTodayUtcDateString = (): string =>
  new Date().toISOString().slice(0, 10);

const isValidCalendarDate = (dateStr: string): boolean => {
  const parts = dateStr.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (year === undefined || month === undefined || day === undefined) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

type FieldErrorKey =
  | "name"
  | "type"
  | "length"
  | "precision"
  | "scale"
  | "defaultValue";

type FieldErrors = Partial<Record<FieldErrorKey, string>>;

export interface DataExtensionFormProps {
  /** Pre-populated fields from schema inference */
  initialFields?: DataExtensionField[];
  /** Available DE folders for folder picker */
  folders?: Folder[];
  /** Existing DEs for name uniqueness check */
  dataExtensions?: DataExtension[];
  /** Called when form is submitted */
  onSubmit: (draft: DataExtensionDraft) => Promise<void>;
  /** Called when user clicks cancel */
  onCancel: () => void;
  /** Button text (default: "Create Data Extension") */
  submitLabel?: string;
  /** External control of loading state */
  isSubmitting?: boolean;
  /** Pre-populated DE name (for auto-generated names) */
  initialName?: string;
}

export function DataExtensionForm({
  initialFields,
  folders,
  dataExtensions,
  onSubmit,
  onCancel,
  submitLabel = "Create Data Extension",
  isSubmitting = false,
  initialName = "",
}: DataExtensionFormProps) {
  const [name, setName] = useState(initialName);
  const [customerKey, setCustomerKey] = useState("");
  const [folderId, setFolderId] = useState("");
  const [isSendable, setIsSendable] = useState(false);
  const [subscriberKeyField, setSubscriberKeyField] = useState("");
  const [fields, setFields] = useState<DataExtensionField[]>(
    initialFields ?? [],
  );
  const [didAttemptSubmit, setDidAttemptSubmit] = useState(false);

  const [isRetentionEnabled, setIsRetentionEnabled] = useState(false);
  const [retentionMode, setRetentionMode] = useState<"period" | "date">(
    "period",
  );
  const [periodLength, setPeriodLength] = useState("30");
  const [periodUnit, setPeriodUnit] = useState<
    "Days" | "Weeks" | "Months" | "Years"
  >("Days");
  const [retainUntil, setRetainUntil] = useState("");
  const [deleteType, setDeleteType] = useState<"individual" | "all">("all");
  const [resetOnImport, setResetOnImport] = useState(false);
  const [deleteAtEnd, setDeleteAtEnd] = useState(false);

  // Reset fields when initialFields changes
  useEffect(() => {
    if (initialFields && initialFields.length > 0) {
      setFields(initialFields);
      setDidAttemptSubmit(false);
    }
  }, [initialFields]);

  // Reset name when initialName changes
  useEffect(() => {
    setName(initialName);
    setDidAttemptSubmit(false);
  }, [initialName]);

  // Filter folders to only data-extension type, excluding System Data Views
  const defolders = useMemo(
    () =>
      folders?.filter(
        (f) => f.type === "data-extension" && !f.id.startsWith("sdv-"),
      ) ?? [],
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

  // Reset subscriberKeyField if it no longer references a valid field
  useEffect(() => {
    if (
      subscriberKeyField &&
      !subscriberKeyEligibleFields.some((f) => f.name === subscriberKeyField)
    ) {
      setSubscriberKeyField("");
    }
  }, [subscriberKeyField, subscriberKeyEligibleFields]);

  // Validation (schema + targeted client-side rules)
  const isRetentionValid = useMemo(() => {
    if (!isRetentionEnabled) {
      return true;
    }

    if (retentionMode === "period") {
      const parsed = Number.parseInt(periodLength, 10);
      return Number.isInteger(parsed) && parsed > 0 && parsed <= 999;
    }

    const today = getTodayUtcDateString();
    return (
      YYYY_MM_DD_REGEX.test(retainUntil) &&
      isValidCalendarDate(retainUntil) &&
      retainUntil >= today
    );
  }, [isRetentionEnabled, retentionMode, periodLength, retainUntil]);

  const retentionPolicy = useMemo<DataRetentionPolicy | undefined>(() => {
    if (!isRetentionEnabled || !isRetentionValid) {
      return undefined;
    }

    const base = {
      deleteType,
      resetOnImport,
      deleteAtEnd,
    } as const;

    if (retentionMode === "period") {
      return {
        type: "period",
        periodLength: Number.parseInt(periodLength, 10),
        periodUnit,
        ...base,
      };
    }

    return {
      type: "date",
      retainUntil,
      ...base,
    };
  }, [
    deleteAtEnd,
    deleteType,
    isRetentionEnabled,
    isRetentionValid,
    periodLength,
    periodUnit,
    resetOnImport,
    retainUntil,
    retentionMode,
  ]);

  const validation = useMemo(() => {
    const trimmedName = name.trim();
    const normalizedFields = fields.map(({ id: _id, ...field }) => ({
      ...field,
      name: field.name.trim(),
      defaultValue: field.defaultValue?.trim() || undefined,
    }));

    const dto = {
      name: trimmedName,
      customerKey: customerKey.trim() || undefined,
      folderId,
      isSendable,
      subscriberKeyField: isSendable ? subscriberKeyField : undefined,
      retention: retentionPolicy,
      fields: normalizedFields,
    };

    const parsed = CreateDataExtensionSchema.safeParse(dto);

    const formErrors: Partial<
      Record<
        "name" | "customerKey" | "folderId" | "subscriberKeyField" | "fields",
        string
      >
    > = {};
    const fieldErrorsById: Record<string, FieldErrors> = {};

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const [root, maybeIndex, maybeKey] = issue.path;

        if (root === "fields" && typeof maybeIndex === "number") {
          const fieldId = fields[maybeIndex]?.id;
          if (!fieldId) {
            continue;
          }
          const key = (maybeKey as FieldErrorKey | undefined) ?? "name";
          fieldErrorsById[fieldId] ??= {};
          fieldErrorsById[fieldId][key] ??= issue.message;
          continue;
        }

        if (root === "fields") {
          formErrors.fields ??= issue.message;
          continue;
        }

        if (
          root === "name" ||
          root === "customerKey" ||
          root === "folderId" ||
          root === "subscriberKeyField"
        ) {
          formErrors[root] ??= issue.message;
        }
      }
    }

    // Duplicate DE name (client-side, using cached metadata)
    const normalizedExistingNames = new Set(
      (dataExtensions ?? []).map((de) => de.name.trim().toLowerCase()),
    );
    if (trimmedName && normalizedExistingNames.has(trimmedName.toLowerCase())) {
      formErrors.name ??= `A Data Extension named "${trimmedName}" already exists.`;
    }

    // Duplicate field names (case-insensitive)
    const normalizedFieldNames = fields
      .map((f) => f.name.trim().toLowerCase())
      .filter(Boolean);
    const fieldNameCounts = normalizedFieldNames.reduce<Map<string, number>>(
      (acc, n) => {
        acc.set(n, (acc.get(n) ?? 0) + 1);
        return acc;
      },
      new Map(),
    );
    const duplicateNames = new Set(
      [...fieldNameCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([n]) => n),
    );

    for (const f of fields) {
      if (!f.id) {
        continue;
      }
      const normalized = f.name.trim().toLowerCase();
      if (normalized && duplicateNames.has(normalized)) {
        const errs = (fieldErrorsById[f.id] ??= {});
        errs.name ??= "Field name must be unique.";
      }

      if (
        (f.type === "Text" ||
          f.type === "EmailAddress" ||
          f.type === "Phone") &&
        (typeof f.length !== "number" || f.length <= 0)
      ) {
        const errs = (fieldErrorsById[f.id] ??= {});
        errs.length ??= "Length is required for this field type.";
      }

      if (f.type === "Decimal") {
        const errs = (fieldErrorsById[f.id] ??= {});
        if (typeof f.precision !== "number") {
          errs.precision ??= "Precision is required for Decimal.";
        }
        if (typeof f.scale !== "number") {
          errs.scale ??= "Scale is required for Decimal.";
        }
        if (
          typeof f.precision === "number" &&
          typeof f.scale === "number" &&
          f.scale > f.precision
        ) {
          errs.scale ??= "Scale must be less than or equal to precision.";
        }
      }

      if (
        (f.type === "EmailAddress" ||
          f.type === "Phone" ||
          f.type === "Locale") &&
        f.defaultValue?.trim()
      ) {
        const errs = (fieldErrorsById[f.id] ??= {});
        errs.defaultValue ??=
          "Default values are not supported for this field type.";
      }
    }

    const hasFieldErrors = Object.values(fieldErrorsById).some((errs) =>
      Object.values(errs).some(Boolean),
    );

    const isSubmittable =
      parsed.success &&
      !hasFieldErrors &&
      isRetentionValid &&
      Object.values(formErrors).every((e) => !e);

    return {
      isSubmittable,
      formErrors,
      fieldErrorsById,
    };
  }, [
    customerKey,
    dataExtensions,
    fields,
    folderId,
    isRetentionValid,
    isSendable,
    name,
    retentionPolicy,
    subscriberKeyField,
  ]);

  const handleAddField = () => {
    setFields((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        type: "Text",
        length: 254,
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

  const handleSubmit = () => {
    setDidAttemptSubmit(true);
    if (!validation.isSubmittable) {
      return;
    }
    if (isSubmitting) {
      return;
    }

    const draft: DataExtensionDraft = {
      name: name.trim(),
      customerKey: customerKey.trim() || undefined,
      folderId,
      isSendable,
      subscriberKeyField: isSendable ? subscriberKeyField : undefined,
      retention: retentionPolicy,
      fields: fields.map((f) => ({
        ...f,
        name: f.name.trim(),
        defaultValue: f.defaultValue?.trim() || undefined,
      })),
    };

    void onSubmit(draft);
  };

  return (
    <TooltipProvider>
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
                (didAttemptSubmit || name.trim()) && validation.formErrors.name
                  ? "border-destructive"
                  : "border-border",
              )}
            />
            {(didAttemptSubmit || name.trim()) && validation.formErrors.name ? (
              <p className="text-[10px] text-destructive">
                {validation.formErrors.name}
              </p>
            ) : null}
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
              placeholder="Optional - auto-generated if blank"
              value={customerKey}
              onChange={(event) => setCustomerKey(event.target.value)}
              className={cn(
                "w-full bg-muted border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary",
                (didAttemptSubmit || customerKey.trim()) &&
                  validation.formErrors.customerKey
                  ? "border-destructive"
                  : "border-border",
              )}
            />
            {(didAttemptSubmit || customerKey.trim()) &&
            validation.formErrors.customerKey ? (
              <p className="text-[10px] text-destructive">
                {validation.formErrors.customerKey}
              </p>
            ) : null}
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
          <FolderTreePicker
            id="de-folder"
            folders={defolders}
            value={folderId}
            onChange={setFolderId}
            placeholder="Select a folder..."
            triggerClassName={
              didAttemptSubmit && validation.formErrors.folderId
                ? "border-destructive"
                : undefined
            }
          />
          {didAttemptSubmit && validation.formErrors.folderId ? (
            <p className="text-[10px] text-destructive">
              {validation.formErrors.folderId}
            </p>
          ) : null}
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
                  Enable to use this DE as a sendable audience for email sends.
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
                  className={cn(
                    "w-full bg-muted border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary cursor-pointer",
                    didAttemptSubmit && validation.formErrors.subscriberKeyField
                      ? "border-destructive"
                      : "border-border",
                  )}
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
                {didAttemptSubmit &&
                validation.formErrors.subscriberKeyField ? (
                  <p className="text-[10px] text-destructive">
                    {validation.formErrors.subscriberKeyField}
                  </p>
                ) : null}
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

          <div className="border border-border/50 rounded-lg overflow-hidden">
            <div className="grid grid-cols-14 gap-2 bg-muted/40 px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <div className="col-span-3">Field</div>
              <div className="col-span-3">Type</div>
              <div className="col-span-2 text-center">Len / P,S</div>
              <div className="col-span-3">Default</div>
              <div className="col-span-1 text-center">PK</div>
              <div className="col-span-1 text-center">Null</div>
              <div className="col-span-1 text-right"> </div>
            </div>
            <div className="max-h-[240px] overflow-y-auto space-y-2 p-2">
              {fields.length === 0 ? (
                <div className="text-[11px] text-muted-foreground px-2 py-3 border border-dashed border-border rounded-lg text-center">
                  No fields added yet. Use &ldquo;Add Field&rdquo; to define
                  your schema.
                </div>
              ) : (
                fields.map((field, index) => (
                  <FieldRow
                    key={field.id}
                    field={field}
                    onChange={(updates) => handleUpdateField(index, updates)}
                    onRemove={() => handleRemoveField(index)}
                    errors={
                      field.id
                        ? validation.fieldErrorsById[field.id]
                        : undefined
                    }
                    showErrors={didAttemptSubmit}
                  />
                ))
              )}
            </div>
            {didAttemptSubmit && validation.formErrors.fields ? (
              <p className="px-2 pb-2 text-[10px] text-destructive">
                {validation.formErrors.fields}
              </p>
            ) : null}
          </div>
        </div>

        {/* Retention Policy */}
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center justify-between">
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
                  Automatically purge records after a set period or date.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsRetentionEnabled(!isRetentionEnabled)}
              className="flex items-center gap-2"
              aria-label="Toggle retention policy"
            >
              <span className="text-[10px] font-bold text-muted-foreground uppercase">
                {isRetentionEnabled ? "On" : "Off"}
              </span>
              <div
                className={cn(
                  "w-8 h-4 rounded-full relative transition-colors",
                  isRetentionEnabled
                    ? "bg-primary"
                    : "bg-muted border border-border",
                )}
              >
                <div
                  className={cn(
                    "absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all",
                    isRetentionEnabled
                      ? "left-[18px] bg-white"
                      : "left-0.5 bg-muted-foreground",
                  )}
                />
              </div>
            </button>
          </div>

          {isRetentionEnabled ? (
            <div className="mt-4 pt-4 border-t border-border/50 space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-[11px] text-foreground">
                  <input
                    type="radio"
                    name="retention-mode"
                    value="period"
                    checked={retentionMode === "period"}
                    onChange={() => setRetentionMode("period")}
                    className="accent-primary"
                  />
                  Period
                </label>
                <label className="flex items-center gap-2 text-[11px] text-foreground">
                  <input
                    type="radio"
                    name="retention-mode"
                    value="date"
                    checked={retentionMode === "date"}
                    onChange={() => setRetentionMode("date")}
                    className="accent-primary"
                  />
                  Date
                </label>
              </div>

              {retentionMode === "period" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="retention-length"
                      className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Length
                    </label>
                    <input
                      id="retention-length"
                      type="number"
                      min={1}
                      max={999}
                      value={periodLength}
                      onChange={(event) => setPeriodLength(event.target.value)}
                      className={cn(
                        "w-full bg-muted border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary",
                        isRetentionEnabled &&
                          retentionMode === "period" &&
                          !isRetentionValid
                          ? "border-destructive"
                          : "border-border",
                      )}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label
                      htmlFor="retention-unit"
                      className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                    >
                      Unit
                    </label>
                    <select
                      id="retention-unit"
                      value={periodUnit}
                      onChange={(event) =>
                        setPeriodUnit(event.target.value as typeof periodUnit)
                      }
                      className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary cursor-pointer"
                    >
                      <option value="Days">Days</option>
                      <option value="Weeks">Weeks</option>
                      <option value="Months">Months</option>
                      <option value="Years">Years</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label
                    htmlFor="retain-until"
                    className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Retain Until
                  </label>
                  <DatePicker
                    id="retain-until"
                    value={retainUntil}
                    min={getTodayUtcDateString()}
                    onChange={setRetainUntil}
                    placeholder="YYYY-MM-DD"
                    className={cn(
                      "w-full bg-muted border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-primary",
                      isRetentionEnabled &&
                        retentionMode === "date" &&
                        !isRetentionValid
                        ? "border-destructive"
                        : "border-border",
                    )}
                  />
                </div>
              )}

              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Deletion Behavior
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-[11px] text-foreground">
                    <input
                      type="radio"
                      name="retention-delete-type"
                      value="individual"
                      checked={deleteType === "individual"}
                      onChange={() => setDeleteType("individual")}
                      className="accent-primary"
                    />
                    Delete individual rows
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-foreground">
                    <input
                      type="radio"
                      name="retention-delete-type"
                      value="all"
                      checked={deleteType === "all"}
                      onChange={() => setDeleteType("all")}
                      className="accent-primary"
                    />
                    Delete all rows at once
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={resetOnImport}
                    onChange={(event) => setResetOnImport(event.target.checked)}
                    className="accent-primary"
                  />
                  Reset on import
                </label>
                <label className="flex items-center gap-2 text-[11px] text-foreground">
                  <input
                    type="checkbox"
                    checked={deleteAtEnd}
                    onChange={(event) => setDeleteAtEnd(event.target.checked)}
                    className="accent-primary"
                  />
                  Delete data extension at end
                </label>
              </div>

              {!isRetentionValid ? (
                <p className="text-[10px] text-destructive">
                  {retentionMode === "period"
                    ? "Retention length must be between 1 and 999."
                    : "Retain-until date must be today or later."}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="text-xs font-bold"
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!validation.isSubmittable || isSubmitting}
          className="bg-primary hover:bg-primary-600 text-primary-foreground text-xs font-bold shadow-lg shadow-primary/20"
        >
          {isSubmitting ? "Creating..." : submitLabel}
        </Button>
      </div>
    </TooltipProvider>
  );
}

interface FieldRowProps {
  field: DataExtensionField;
  onChange: (updates: Partial<DataExtensionField>) => void;
  onRemove: () => void;
  errors?: FieldErrors;
  showErrors: boolean;
}

function FieldRow({
  field,
  onChange,
  onRemove,
  errors,
  showErrors,
}: FieldRowProps) {
  const isDecimal = field.type === "Decimal";
  const isDate = field.type === "Date";
  const isCurrentDateDefault =
    isDate && field.defaultValue?.trim().toLowerCase() === "now()";
  const supportsLength =
    field.type === "Text" ||
    field.type === "EmailAddress" ||
    field.type === "Phone";
  const supportsDefaultValue =
    field.type !== "EmailAddress" &&
    field.type !== "Phone" &&
    field.type !== "Locale";
  const isBoolean = field.type === "Boolean";

  // Validate field name
  const isFieldNameInvalid =
    field.name.trim() !== "" &&
    FIELD_NAME_VALIDATION.pattern.test(field.name.trim());

  const rowErrorMessages =
    showErrors && errors ? Object.values(errors).filter(Boolean) : [];

  const hasRowError =
    (showErrors && errors && Object.values(errors).some(Boolean)) ||
    isFieldNameInvalid;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "grid grid-cols-14 gap-2 items-center bg-card p-2 rounded border hover:border-primary/50 transition-colors group",
          hasRowError ? "border-destructive" : "border-border/50",
        )}
      >
        <div className="col-span-3">
          <input
            type="text"
            value={field.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Field name"
            className={cn(
              "w-full bg-transparent text-xs focus:outline-none",
              (isFieldNameInvalid || (showErrors && errors?.name)) &&
                "text-destructive",
            )}
          />
        </div>
        <div className="col-span-3">
          <Select
            value={field.type}
            onChange={(event) => {
              const nextType = event.target.value as SFMCFieldType;
              onChange({
                type: nextType,
                length:
                  nextType === "Text" ||
                  nextType === "EmailAddress" ||
                  nextType === "Phone"
                    ? (field.length ?? 254)
                    : undefined,
                precision:
                  nextType === "Decimal" ? (field.precision ?? 18) : undefined,
                scale: nextType === "Decimal" ? (field.scale ?? 2) : undefined,
                defaultValue: undefined,
              });
            }}
            className={cn(
              "h-7 w-full bg-muted text-foreground border rounded px-2 py-0 text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0",
              showErrors && errors?.type
                ? "border-destructive"
                : "border-border",
            )}
          >
            <option value="Text">Text</option>
            <option value="Number">Number</option>
            <option value="Date">Date</option>
            <option value="Boolean">Boolean</option>
            <option value="Decimal">Decimal</option>
            <option value="EmailAddress">EmailAddress</option>
            <option value="Phone">Phone</option>
            <option value="Locale">Locale</option>
          </Select>
        </div>
        <div className="col-span-2">
          {isDecimal ? (
            <div className="grid grid-cols-2 gap-1">
              <input
                type="number"
                aria-label="Precision"
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
                placeholder="P"
                className={cn(
                  "h-7 w-full bg-muted border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-primary",
                  showErrors && errors?.precision
                    ? "border-destructive"
                    : "border-border",
                )}
              />
              <input
                type="number"
                aria-label="Scale"
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
                placeholder="S"
                className={cn(
                  "h-7 w-full bg-muted border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-primary",
                  showErrors && errors?.scale
                    ? "border-destructive"
                    : "border-border",
                )}
              />
            </div>
          ) : supportsLength ? (
            <input
              type="number"
              min={1}
              value={field.length ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                const numericValue = Number(value);
                onChange({
                  length:
                    value && !Number.isNaN(numericValue)
                      ? Math.max(1, numericValue)
                      : undefined,
                });
              }}
              placeholder="Len"
              className={cn(
                "h-7 w-full bg-muted border rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-primary",
                showErrors && errors?.length
                  ? "border-destructive"
                  : "border-border",
              )}
            />
          ) : (
            <div className="h-7 w-full flex items-center justify-center text-[10px] text-muted-foreground">
              —
            </div>
          )}
        </div>
        <div className="col-span-3">
          {isDate ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  onChange({
                    defaultValue: isCurrentDateDefault ? undefined : "Now()",
                  })
                }
                className={cn(
                  "h-7 px-2 rounded border text-[10px] font-bold uppercase tracking-wider transition-colors",
                  isCurrentDateDefault
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-border hover:border-primary/60",
                )}
                aria-label="Toggle current date default"
              >
                Now
              </button>
              {isCurrentDateDefault ? (
                <span className="text-[10px] text-muted-foreground">Now()</span>
              ) : (
                <input
                  type="text"
                  value={field.defaultValue ?? ""}
                  onChange={(event) =>
                    onChange({
                      defaultValue: event.target.value || undefined,
                    })
                  }
                  placeholder="Default"
                  className={cn(
                    "h-7 w-full bg-muted border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary",
                    showErrors && errors?.defaultValue
                      ? "border-destructive"
                      : "border-border",
                  )}
                />
              )}
            </div>
          ) : supportsDefaultValue ? (
            isBoolean ? (
              <Select
                value={field.defaultValue ?? ""}
                onChange={(event) =>
                  onChange({ defaultValue: event.target.value || undefined })
                }
                className={cn(
                  "h-7 w-full bg-muted text-foreground border rounded px-2 py-0 text-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0",
                  showErrors && errors?.defaultValue
                    ? "border-destructive"
                    : "border-border",
                )}
              >
                <option value=""> </option>
                <option value="True">True</option>
                <option value="False">False</option>
              </Select>
            ) : (
              <input
                type="text"
                value={field.defaultValue ?? ""}
                onChange={(event) =>
                  onChange({
                    defaultValue: event.target.value || undefined,
                  })
                }
                placeholder="Default"
                className={cn(
                  "h-7 w-full bg-muted border rounded px-2 py-1 text-xs focus:outline-none focus:border-primary",
                  showErrors && errors?.defaultValue
                    ? "border-destructive"
                    : "border-border",
                )}
              />
            )
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="h-7 w-full flex items-center text-[10px] text-muted-foreground cursor-help">
                  —
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                Default values are not supported for this field type
              </TooltipContent>
            </Tooltip>
          )}
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

      {/* Field name validation error */}
      {isFieldNameInvalid ? (
        <p className="ml-4 text-[10px] text-destructive">
          {FIELD_NAME_VALIDATION.message}
        </p>
      ) : null}

      {rowErrorMessages.length > 0 ? (
        <div className="ml-4 space-y-1">
          {rowErrorMessages.map((m) => (
            <p key={m} className="text-[10px] text-destructive">
              {m}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
