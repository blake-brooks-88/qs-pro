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
      .min(1, "Customer key is required")
      .max(CUSTOMER_KEY_VALIDATION.maxLength, CUSTOMER_KEY_VALIDATION.message),
    folderId: z
      .string()
      .regex(/^\d+$/, "Folder ID must be a numeric MCE folder ID"),
    isSendable: z.boolean().default(false),
    subscriberKeyField: z
      .string()
      .max(254, "Subscriber key field must be 254 characters or less")
      .optional(),
    fields: z
      .array(DataExtensionFieldSchema)
      .min(1, "At least one field is required"),
  })
  .superRefine((data, ctx) => {
    // subscriberKeyField is required when isSendable is true
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
export type CreateDataExtensionDto = z.infer<typeof CreateDataExtensionSchema>;
