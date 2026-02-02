import { z } from "zod";

// MCE restricted character patterns
const DE_NAME_RESTRICTED_CHARS = /[!@#$%'^*()={}[\]\\.<>/"":?|,+]/;
const FIELD_NAME_RESTRICTED_CHARS = /[!@#$%'^*()={}[\]\\.<>/"":?|,_&+]/;

// Validation helpers for external use
export const DE_NAME_VALIDATION = {
  pattern: DE_NAME_RESTRICTED_CHARS,
  message: "Name contains restricted characters: !@#$%'^*()={}[]\\.<>/\":?|,+",
};

export const FIELD_NAME_VALIDATION = {
  pattern: FIELD_NAME_RESTRICTED_CHARS,
  message:
    "Field name contains restricted characters: !@#$%'^*()={}[]\\.<>/\":?|,_&+",
};

export const CUSTOMER_KEY_VALIDATION = {
  maxLength: 36,
  message: "Customer key must be 36 characters or less",
};

// Field type enum
const FieldTypeEnum = z.enum([
  "Text",
  "Number",
  "Date",
  "Boolean",
  "EmailAddress",
  "Phone",
  "Decimal",
  "Locale",
]);

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

export const DataRetentionPolicySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("period"),
    periodLength: z.number().int().positive().max(999),
    periodUnit: z.enum(["Days", "Weeks", "Months", "Years"]),
    deleteType: z.enum(["individual", "all"]),
    resetOnImport: z.boolean(),
    deleteAtEnd: z.boolean(),
  }),
  z.object({
    type: z.literal("date"),
    retainUntil: z
      .string()
      .regex(YYYY_MM_DD_REGEX, "Must be YYYY-MM-DD format")
      .refine(isValidCalendarDate, "Must be a valid calendar date")
      .refine(
        (d) => d >= getTodayUtcDateString(),
        "Retain until date must be today or later",
      ),
    deleteType: z.enum(["individual", "all"]),
    resetOnImport: z.boolean(),
    deleteAtEnd: z.boolean(),
  }),
]);

// Data Extension Field Schema
export const DataExtensionFieldSchema = z.object({
  name: z
    .string()
    .min(1, "Field name is required")
    .max(100, "Field name must be 100 characters or less")
    .refine(
      (val) => !FIELD_NAME_RESTRICTED_CHARS.test(val),
      FIELD_NAME_VALIDATION.message,
    ),
  type: FieldTypeEnum,
  length: z.number().int().positive().optional(),
  scale: z.number().int().min(0).max(18).optional(),
  precision: z.number().int().min(1).max(38).optional(),
  isPrimaryKey: z.boolean(),
  isNullable: z.boolean(),
  defaultValue: z.string().optional(),
});

// Create Data Extension Schema
export const CreateDataExtensionSchema = z
  .object({
    name: z
      .string()
      .min(1, "Data Extension name is required")
      .max(100, "Data Extension name must be 100 characters or less")
      .refine(
        (val) => !val.startsWith("_"),
        "Data Extension name cannot start with underscore",
      )
      .refine(
        (val) => !DE_NAME_RESTRICTED_CHARS.test(val),
        DE_NAME_VALIDATION.message,
      ),
    customerKey: z
      .string()
      .max(CUSTOMER_KEY_VALIDATION.maxLength, CUSTOMER_KEY_VALIDATION.message)
      .optional(),
    folderId: z
      .string()
      .regex(/^\d+$/, "Folder ID must be a numeric MCE folder ID")
      .refine((value) => {
        const parsed = Number.parseInt(value, 10);
        return Number.isSafeInteger(parsed) && parsed > 0;
      }, "Folder ID must be a positive numeric MCE folder ID"),
    isSendable: z.boolean().default(false),
    subscriberKeyField: z
      .string()
      .max(254, "Subscriber key field must be 254 characters or less")
      .optional(),
    retention: DataRetentionPolicySchema.optional(),
    fields: z
      .array(DataExtensionFieldSchema)
      .min(1, "At least one field is required"),
  })
  .superRefine((data, ctx) => {
    const seenNames = new Set<string>();
    for (let i = 0; i < data.fields.length; i++) {
      const field = data.fields[i];
      if (!field) {
        continue;
      }
      const normalizedName = field.name.toLowerCase();
      if (seenNames.has(normalizedName)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate field name "${field.name}" (field names are case-insensitive)`,
          path: ["fields", i, "name"],
        });
      }
      seenNames.add(normalizedName);
    }

    if (data.isSendable && !data.subscriberKeyField) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Subscriber key field is required when Data Extension is sendable",
        path: ["subscriberKeyField"],
      });
      return;
    }

    // subscriberKeyField must reference a Text or EmailAddress field
    if (data.subscriberKeyField) {
      const matchingField = data.fields.find(
        (field) => field.name === data.subscriberKeyField,
      );

      if (!matchingField) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Subscriber key field "${data.subscriberKeyField}" does not match any field name`,
          path: ["subscriberKeyField"],
        });
        return;
      }

      if (
        matchingField.type !== "Text" &&
        matchingField.type !== "EmailAddress"
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Subscriber key field must reference a Text or EmailAddress field",
          path: ["subscriberKeyField"],
        });
      }
    }
  });

// Types derived from schemas
export type DataExtensionFieldDto = z.infer<typeof DataExtensionFieldSchema>;
export type DataRetentionPolicy = z.infer<typeof DataRetentionPolicySchema>;
export type CreateDataExtensionDto = z.infer<typeof CreateDataExtensionSchema>;
