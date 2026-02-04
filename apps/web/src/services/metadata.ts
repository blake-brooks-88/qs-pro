import type { CreateDataExtensionDto } from "@qpp/shared-types";

import api from "@/services/api";
import type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
} from "@/services/metadata.types";
import { getSystemDataViewFields } from "@/services/system-data-views";

export type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
};

export async function getFolders(
  eid?: string,
  contentType?: string,
): Promise<DataFolderResponseDto[]> {
  const params: Record<string, string> = {};
  if (eid) {
    params.eid = eid;
  }
  if (contentType) {
    params.contentType = contentType;
  }
  const { data } = await api.get<DataFolderResponseDto[]>("/metadata/folders", {
    params: Object.keys(params).length > 0 ? params : undefined,
  });
  return data;
}

export async function getDataExtensions(
  eid: string,
): Promise<DataExtensionResponseDto[]> {
  const { data } = await api.get<DataExtensionResponseDto[]>(
    "/metadata/data-extensions",
    { params: { eid } },
  );
  return data;
}

export async function getFields(
  customerKey: string,
  eid?: string,
): Promise<DataExtensionFieldResponseDto[]> {
  // Check if this is a system data view first (always enabled for field lookups)
  const systemFields = getSystemDataViewFields(customerKey);
  if (systemFields.length > 0) {
    return systemFields;
  }

  const params: Record<string, string> = { key: customerKey };
  if (eid) {
    params.eid = eid;
  }

  const { data } = await api.get<DataExtensionFieldResponseDto[]>(
    "/metadata/fields",
    { params },
  );
  return data;
}

export interface DataExtensionDetailsResult {
  hasPrimaryKey: boolean;
  fieldCount: number;
  fields: DataExtensionFieldResponseDto[];
}

export async function fetchDataExtensionDetails(params: {
  customerKey: string;
  eid?: string;
}): Promise<DataExtensionDetailsResult> {
  const fields = await getFields(params.customerKey, params.eid);
  return {
    hasPrimaryKey: fields.some(
      (f) => f.IsPrimaryKey === true || f.IsPrimaryKey === "true",
    ),
    fieldCount: fields.length,
    fields,
  };
}

export async function createDataExtension(
  data: CreateDataExtensionDto,
): Promise<{ objectId: string }> {
  const response = await api.post<{ objectId: string }>(
    "/metadata/data-extensions",
    data,
  );
  return response.data;
}
