/**
 * Schema Inferrer - Thin wrapper around @qpp/schema-inferrer
 *
 * Adapts the shared schema inference logic to frontend types.
 * Converts between PascalCase (core package) and camelCase (frontend).
 */

import {
  type InferredField,
  inferSchema,
  type MetadataFetcher as CoreMetadataFetcher,
  type MetadataField,
} from "@qpp/schema-inferrer";

import type { DataExtensionField, SFMCFieldType } from "../types";

/**
 * Interface for fetching field metadata from data extensions.
 * Uses camelCase to match frontend conventions.
 */
export interface MetadataFetcher {
  getFieldsForTable(
    tableName: string,
  ): Promise<{ name: string; type: SFMCFieldType; length?: number }[] | null>;
}

function createCoreMetadataFetcher(
  frontendFetcher: MetadataFetcher,
): CoreMetadataFetcher {
  return {
    async getFieldsForTable(
      tableName: string,
    ): Promise<MetadataField[] | null> {
      const fields = await frontendFetcher.getFieldsForTable(tableName);
      if (!fields) {
        return null;
      }
      return fields.map((f) => ({
        Name: f.name,
        FieldType: f.type,
        MaxLength: f.length,
      }));
    },
  };
}

function toDataExtensionField(field: InferredField): DataExtensionField {
  const result: DataExtensionField = {
    id: crypto.randomUUID(),
    name: field.Name,
    type: field.FieldType as SFMCFieldType,
    isPrimaryKey: false,
    isNullable: true,
  };

  if (field.MaxLength !== undefined) {
    result.length = field.MaxLength;
  }

  if (field.Scale !== undefined) {
    result.scale = field.Scale;
  }

  if (field.Precision !== undefined) {
    result.precision = field.Precision;
  }

  return result;
}

/**
 * Infer Data Extension field schema from a SQL SELECT query.
 *
 * @param sql - The SQL query to analyze
 * @param metadataFetcher - Interface to fetch field metadata for data extensions
 * @returns Array of DataExtensionField with inferred types
 * @throws Error if the SQL cannot be parsed or no columns are found
 */
export async function inferSchemaFromQuery(
  sql: string,
  metadataFetcher: MetadataFetcher,
): Promise<DataExtensionField[]> {
  const coreFetcher = createCoreMetadataFetcher(metadataFetcher);
  const result = await inferSchema(sql, coreFetcher);

  if (!result.success) {
    throw new Error(result.error.message);
  }

  return result.fields.map(toDataExtensionField);
}
