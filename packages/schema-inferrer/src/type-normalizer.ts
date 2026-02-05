import type { MCEFieldType } from "./types";

const TYPE_ALIASES: Record<string, MCEFieldType> = {
  // Canonical types (case variations)
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Boolean",
  emailaddress: "EmailAddress",
  phone: "Phone",
  decimal: "Decimal",
  locale: "Locale",
  // Common aliases
  email: "EmailAddress", // "Email" → "EmailAddress"
  string: "Text",
  int: "Number",
  integer: "Number",
  float: "Decimal",
  double: "Decimal",
  bool: "Boolean",
  bit: "Boolean", // SQL Server BIT type
  datetime: "Date", // SQL Server DATETIME type
};

/**
 * Normalize field type strings to canonical MCEFieldType.
 * Handles variations like "Email" → "EmailAddress", case insensitivity.
 *
 * Unknown types default to "Text" (with MaxLength: 254 if not specified).
 * This is a best-effort, non-blocking approach - inference should always
 * succeed, never throw on unexpected metadata.
 */
export function normalizeFieldType(fieldType: string): MCEFieldType {
  const normalized = TYPE_ALIASES[fieldType.toLowerCase()];
  return normalized ?? "Text";
}
