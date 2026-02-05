export type MCEFieldType =
  | "Text"
  | "Number"
  | "Date"
  | "Boolean"
  | "EmailAddress"
  | "Phone"
  | "Decimal"
  | "Locale";

/**
 * Inferred field from schema analysis.
 * Uses PascalCase to match MCE API conventions.
 */
export interface InferredField {
  Name: string;
  FieldType: MCEFieldType;
  MaxLength?: number;
  Scale?: number;
  Precision?: number;
}

/**
 * Type constraints only (no Name) - for inferring from metadata type strings.
 */
export interface FieldTypeConstraints {
  FieldType: MCEFieldType;
  MaxLength?: number;
  Scale?: number;
  Precision?: number;
}

/**
 * Metadata field from external sources (MCE API, cached data).
 * Uses string for FieldType since external sources may use variations
 * like "Email" vs "EmailAddress".
 */
export interface MetadataField {
  Name: string;
  FieldType: string; // Loose type - normalized to MCEFieldType internally
  MaxLength?: number;
}

/**
 * Interface for fetching field metadata from data extensions.
 * Returns MetadataField[] (loose types) - core normalizes to MCEFieldType.
 */
export interface MetadataFetcher {
  getFieldsForTable(tableName: string): Promise<MetadataField[] | null>;
}

/**
 * Error codes for schema inference.
 * Note: METADATA_LOOKUP_FAILED is reserved for future use.
 * Currently, null from metadataFetcher falls back to defaults (Text 254).
 */
export type InferErrorCode = "PARSE_ERROR" | "NO_COLUMNS";

export interface InferError {
  code: InferErrorCode;
  message: string;
  sql?: string;
  details?: unknown;
}

export type InferResult =
  | { success: true; fields: InferredField[] }
  | { success: false; error: InferError };
