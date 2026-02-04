import {
  useIsFetching,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useMemo } from "react";

import type {
  DataExtension,
  DataExtensionField,
  Folder,
  SFMCFieldType,
} from "@/features/editor-workspace/types";
import { useFeature } from "@/hooks/use-feature";
import {
  type DataExtensionFieldResponseDto,
  type DataExtensionResponseDto,
  type DataFolderResponseDto,
  getDataExtensions,
  getFields,
  getFolders,
} from "@/services/metadata";
import {
  getSystemDataViewExtensions,
  getSystemDataViewFolders,
} from "@/services/system-data-views";

interface MetadataState {
  folders: Folder[];
  dataExtensions: DataExtension[];
  isLoading: boolean;
  isDataExtensionsFetching: boolean;
  error: MetadataLoadError | null;
}

export interface MetadataLoadError {
  kind: "folders" | "dataExtensions";
  title: string;
  description?: string;
  status?: number;
  path?: string;
}

interface DataExtensionsParams {
  tenantId?: string | null;
  eid?: string;
  enabled?: boolean;
}

interface DataExtensionFieldsParams {
  tenantId?: string | null;
  customerKey?: string;
  enabled?: boolean;
}

const METADATA_STALE_TIME_MS = 5 * 60 * 1000;
const METADATA_GC_TIME_MS = 30 * 60 * 1000;

export const metadataQueryKeys = {
  all: ["metadata"] as const,
  folders: (tenantId?: string | null, eid?: string) =>
    [
      ...metadataQueryKeys.all,
      "folders",
      tenantId ?? "unknown",
      eid ?? "unknown",
    ] as const,
  dataExtensions: (tenantId?: string | null, eid?: string) =>
    [
      ...metadataQueryKeys.all,
      "data-extensions",
      tenantId ?? "unknown",
      eid ?? "unknown",
    ] as const,
  fields: (tenantId?: string | null, customerKey?: string) =>
    [
      ...metadataQueryKeys.all,
      "fields",
      tenantId ?? "unknown",
      customerKey ?? "unknown",
    ] as const,
};

const normalizeId = (value?: string | number) => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const normalizeParentId = (value?: string | number) => {
  const normalized = normalizeId(value);
  if (!normalized || normalized === "0") {
    return null;
  }
  return normalized;
};

const parseBoolean = (value?: boolean | string) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
};

const FIELD_TYPE_MAP = new Map<string, SFMCFieldType>([
  ["Text", "Text"],
  ["Number", "Number"],
  ["Date", "Date"],
  ["Boolean", "Boolean"],
  ["Email", "EmailAddress"],
  ["EmailAddress", "EmailAddress"],
  ["Phone", "Phone"],
  ["Decimal", "Decimal"],
  ["Locale", "Locale"],
]);

const mapFieldType = (value?: string): SFMCFieldType => {
  if (!value) {
    return "Text";
  }
  const normalized = value.trim();
  return FIELD_TYPE_MAP.get(normalized) ?? "Text";
};

const mapFolders = (raw: DataFolderResponse[]): Folder[] => {
  return raw
    .map((item) => {
      const id = normalizeId(item.ID);
      if (!id) {
        return null;
      }
      const parentId = normalizeParentId(item.ParentFolder?.ID);
      return {
        id,
        name: item.Name ?? "Untitled Folder",
        parentId,
        type: "data-extension",
      };
    })
    .filter((folder): folder is Folder => Boolean(folder));
};

const mapDataExtensions = (raw: DataExtensionResponse[]): DataExtension[] => {
  return raw
    .map((item) => {
      const id = normalizeId(item.CustomerKey);
      const folderId = normalizeParentId(item.CategoryID);
      if (!id) {
        return null;
      }
      const fields: DataExtensionField[] = [];
      return {
        id,
        name: item.Name ?? id,
        customerKey: id,
        folderId: folderId ?? "",
        description: "",
        fields,
        isShared: item.isShared ?? false,
      };
    })
    .filter((de): de is DataExtension => Boolean(de));
};

const mapFields = (raw: DataExtensionFieldResponse[]): DataExtensionField[] => {
  return raw
    .map((item) => {
      const name = item.Name?.trim();
      if (!name) {
        return null;
      }
      const length =
        item.MaxLength === undefined || item.MaxLength === null
          ? undefined
          : Number(item.MaxLength);
      const field: DataExtensionField = {
        name,
        type: mapFieldType(item.FieldType),
        isPrimaryKey: parseBoolean(item.IsPrimaryKey),
        isNullable: !parseBoolean(item.IsRequired),
      };
      const normalizedLength = Number.isNaN(length) ? undefined : length;
      if (normalizedLength !== undefined) {
        field.length = normalizedLength;
      }
      return field;
    })
    .filter((field): field is DataExtensionField => Boolean(field));
};

type DataFolderResponse = DataFolderResponseDto;
type DataExtensionResponse = DataExtensionResponseDto;
type DataExtensionFieldResponse = DataExtensionFieldResponseDto;

const formatErrorDescription = (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : "Unknown error";
  }

  const status = error.response?.status;
  const responseData = error.response?.data as
    | {
        path?: string;
        message?: unknown;
      }
    | undefined;

  const path =
    typeof responseData?.path === "string" ? responseData.path : undefined;

  const message =
    typeof responseData?.message === "string"
      ? responseData.message
      : responseData?.message
        ? JSON.stringify(responseData.message)
        : error.message;

  const statusText =
    typeof status === "number" ? `HTTP ${status}` : "Request failed";

  return path
    ? `${statusText} • ${path} — ${message}`
    : `${statusText} — ${message}`;
};

const buildMetadataError = (
  kind: MetadataLoadError["kind"],
  error: unknown,
): MetadataLoadError => {
  const title =
    kind === "folders"
      ? "Couldn't load Data Extension folders"
      : "Couldn't load Data Extensions";

  if (!axios.isAxiosError(error)) {
    return { kind, title, description: formatErrorDescription(error) };
  }

  const status = error.response?.status;
  const responseData = error.response?.data as { path?: string } | undefined;
  const path =
    typeof responseData?.path === "string" ? responseData.path : undefined;

  return {
    kind,
    title,
    description: formatErrorDescription(error),
    status,
    path,
  };
};

const fetchFolders = async (eid?: string): Promise<Folder[]> => {
  const data = await getFolders(eid);
  return mapFolders(Array.isArray(data) ? data : []);
};

const fetchDataExtensions = async (eid?: string): Promise<DataExtension[]> => {
  if (!eid) {
    return [];
  }
  const data = await getDataExtensions(eid);
  return mapDataExtensions(Array.isArray(data) ? data : []);
};

const getFoldersQueryOptions = (
  tenantId?: string | null,
  eid?: string,
): UseQueryOptions<Folder[], Error> => ({
  queryKey: metadataQueryKeys.folders(tenantId, eid),
  queryFn: () => fetchFolders(eid),
  staleTime: METADATA_STALE_TIME_MS,
  gcTime: METADATA_GC_TIME_MS,
  retry: false,
  enabled: true,
});

const getDataExtensionsQueryOptions = (
  tenantId?: string | null,
  eid?: string,
): UseQueryOptions<DataExtension[], Error> => ({
  queryKey: metadataQueryKeys.dataExtensions(tenantId, eid),
  queryFn: () => fetchDataExtensions(eid),
  staleTime: METADATA_STALE_TIME_MS,
  gcTime: METADATA_GC_TIME_MS,
  retry: false,
  enabled: Boolean(eid),
});

export const buildFieldsQueryOptions = (
  tenantId?: string | null,
  customerKey?: string,
): UseQueryOptions<DataExtensionField[], Error> => ({
  queryKey: metadataQueryKeys.fields(tenantId, customerKey),
  queryFn: async () => {
    if (!customerKey) {
      return [];
    }
    const data = await getFields(customerKey);
    return mapFields(Array.isArray(data) ? data : []);
  },
  staleTime: METADATA_STALE_TIME_MS,
  gcTime: METADATA_GC_TIME_MS,
  retry: false,
  enabled: Boolean(tenantId && customerKey),
});

export function useMetadataFolders(tenantId?: string | null, eid?: string) {
  return useQuery(getFoldersQueryOptions(tenantId, eid));
}

export function useDataExtensions({
  tenantId,
  eid,
  enabled = true,
}: DataExtensionsParams) {
  return useQuery({
    ...getDataExtensionsQueryOptions(tenantId, eid),
    enabled: Boolean(eid) && enabled,
  });
}

export function usePrefetchDataExtensions({
  tenantId,
  eid,
  enabled = true,
}: DataExtensionsParams) {
  const queryClient = useQueryClient();
  const options = useMemo(
    () => ({
      queryKey: metadataQueryKeys.dataExtensions(tenantId, eid),
      queryFn: () => fetchDataExtensions(eid),
      staleTime: METADATA_STALE_TIME_MS,
      gcTime: METADATA_GC_TIME_MS,
      retry: false,
    }),
    [tenantId, eid],
  );

  useEffect(() => {
    if (!enabled || !eid) {
      return;
    }
    void queryClient.prefetchQuery(options);
  }, [enabled, eid, options, queryClient]);
}

export function useDataExtensionFields({
  tenantId,
  customerKey,
  enabled = true,
}: DataExtensionFieldsParams) {
  return useQuery({
    ...buildFieldsQueryOptions(tenantId, customerKey),
    enabled: Boolean(tenantId && customerKey) && enabled,
  });
}

export function useMetadata({
  tenantId,
  eid,
}: {
  tenantId?: string | null;
  eid?: string;
} = {}): MetadataState {
  const { enabled: systemDataViewsEnabled } = useFeature("systemDataViews");

  const folderQuery = useMetadataFolders(tenantId, eid);

  usePrefetchDataExtensions({
    tenantId,
    eid,
    enabled: folderQuery.isSuccess,
  });

  const dataExtensionsQuery = useDataExtensions({
    tenantId,
    eid,
    enabled: false,
  });

  const isDataExtensionsFetching =
    useIsFetching({
      queryKey: metadataQueryKeys.dataExtensions(tenantId, eid),
    }) > 0;

  const error = folderQuery.error
    ? buildMetadataError("folders", folderQuery.error)
    : dataExtensionsQuery.error
      ? buildMetadataError("dataExtensions", dataExtensionsQuery.error)
      : null;

  // Merge system data views when feature is enabled
  const baseFolders = folderQuery.data ?? [];
  const baseDataExtensions = dataExtensionsQuery.data ?? [];

  const folders = systemDataViewsEnabled
    ? [...baseFolders, ...mapFolders(getSystemDataViewFolders())]
    : baseFolders;

  const dataExtensions = systemDataViewsEnabled
    ? [
        ...baseDataExtensions,
        ...mapDataExtensions(getSystemDataViewExtensions()),
      ]
    : baseDataExtensions;

  return {
    folders,
    dataExtensions,
    isLoading: folderQuery.isLoading,
    isDataExtensionsFetching,
    error,
  };
}
