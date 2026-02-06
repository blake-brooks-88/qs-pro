/**
 * Schema Inferrer - Thin wrapper around @qpp/schema-inferrer
 *
 * Converts Result type to AppError for backward compatibility with existing
 * worker code that expects thrown errors.
 */

import { AppError, ErrorCode } from "@qpp/backend-shared";
import {
  type FieldTypeConstraints,
  inferFieldTypeFromMetadata as coreInferFieldTypeFromMetadata,
  type InferredField,
  inferSchema as coreInferSchema,
  type MetadataFetcher,
} from "@qpp/schema-inferrer";

/**
 * @deprecated Use InferredField from @qpp/schema-inferrer directly
 */
export type ColumnDefinition = InferredField;

export async function inferSchema(
  sqlText: string,
  metadataFn: MetadataFetcher,
): Promise<InferredField[]> {
  const result = await coreInferSchema(sqlText, metadataFn);
  if (!result.success) {
    throw new AppError(
      ErrorCode.SCHEMA_INFERENCE_FAILED,
      new Error(result.error.message),
      { reason: result.error.code },
    );
  }
  return result.fields;
}

/**
 * @deprecated Use inferFieldTypeFromMetadata from @qpp/schema-inferrer directly
 */
export function inferColumnTypeFromMetadata(
  metadataType: string,
): FieldTypeConstraints {
  return coreInferFieldTypeFromMetadata(metadataType);
}

export { type InferredField, type MetadataFetcher } from "@qpp/schema-inferrer";
