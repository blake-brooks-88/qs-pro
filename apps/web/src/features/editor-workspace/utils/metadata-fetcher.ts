import type { QueryClient } from "@tanstack/react-query";

import {
  getSystemDataViewFields,
  isSystemDataView,
} from "@/services/system-data-views";

import {
  buildFieldsQueryOptions,
  metadataQueryKeys,
} from "../hooks/use-metadata";
import type {
  DataExtension,
  DataExtensionField,
  SFMCFieldType,
} from "../types";

export interface MetadataFetcher {
  getFieldsForTable(
    tableName: string,
  ): Promise<{ name: string; type: SFMCFieldType; length?: number }[] | null>;
}

const FIELD_TYPE_MAP: Record<string, SFMCFieldType> = {
  Text: "Text",
  Number: "Number",
  Date: "Date",
  Boolean: "Boolean",
  Email: "EmailAddress",
  EmailAddress: "EmailAddress",
  Phone: "Phone",
  Decimal: "Decimal",
  Locale: "Locale",
};

const mapFieldType = (value?: string): SFMCFieldType =>
  FIELD_TYPE_MAP[value?.trim() ?? ""] ?? "Text";

function stripBrackets(name: string): string {
  if (name.startsWith("[") && name.endsWith("]")) {
    return name.slice(1, -1);
  }
  return name;
}

function normalizeTableIdentifier(tableName: string): {
  effectiveName: string;
  hasEntPrefix: boolean;
} {
  const trimmed = tableName.trim();
  const segments = trimmed.split(".");
  const stripped = segments.map(stripBrackets);

  let hasEntPrefix = false;
  let effectiveSegments = stripped;

  if (stripped.length > 1 && stripped[0]?.toLowerCase() === "ent") {
    hasEntPrefix = true;
    effectiveSegments = stripped.slice(1);
  }

  return { effectiveName: effectiveSegments.join("."), hasEntPrefix };
}

export function createMetadataFetcher(
  queryClient: QueryClient,
  tenantId: string | null | undefined,
  eid: string | undefined,
): MetadataFetcher {
  return {
    async getFieldsForTable(tableName: string) {
      const { effectiveName } = normalizeTableIdentifier(tableName);

      // 1. Check system data views first
      if (isSystemDataView(effectiveName)) {
        const systemFields = getSystemDataViewFields(effectiveName);
        return systemFields.map((f) => ({
          name: f.Name ?? "",
          type: mapFieldType(f.FieldType),
          length: f.MaxLength ? Number(f.MaxLength) : undefined,
        }));
      }

      // 2. Resolve tableName → customerKey from cached dataExtensions
      const dataExtensions = queryClient.getQueryData<DataExtension[]>(
        metadataQueryKeys.dataExtensions(tenantId, eid),
      );

      const normalizedLookup = effectiveName.toLowerCase();
      const matchedDE = dataExtensions?.find(
        (de) =>
          de.name.toLowerCase() === normalizedLookup ||
          de.customerKey.toLowerCase() === normalizedLookup,
      );

      if (!matchedDE) {
        return null;
      }

      const customerKey = matchedDE.customerKey;

      // 3. Try fields cache lookup
      const cachedFields = queryClient.getQueryData<DataExtensionField[]>(
        metadataQueryKeys.fields(tenantId, customerKey),
      );
      if (cachedFields && cachedFields.length > 0) {
        return cachedFields.map((f) => ({
          name: f.name,
          type: f.type,
          length: f.length,
        }));
      }

      // 4. Fetch fields from API using customerKey
      try {
        const options = buildFieldsQueryOptions(tenantId, customerKey);
        const data = await queryClient.fetchQuery(options);
        return data.map((f) => ({
          name: f.name,
          type: f.type,
          length: f.length,
        }));
      } catch {
        return null;
      }
    },
  };
}
