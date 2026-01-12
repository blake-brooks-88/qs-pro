import api from "@/services/api";
import { getSystemDataViewFields } from "@/services/system-data-views";
import type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
} from "@/services/metadata.types";

export type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
};

export async function getFolders(
  eid?: string,
): Promise<DataFolderResponseDto[]> {
  const { data } = await api.get<DataFolderResponseDto[]>("/metadata/folders", {
    params: eid ? { eid } : undefined,
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
): Promise<DataExtensionFieldResponseDto[]> {
  // Check if this is a system data view first (always enabled for field lookups)
  const systemFields = getSystemDataViewFields(customerKey);
  if (systemFields.length > 0) {
    return systemFields;
  }

  const { data } = await api.get<DataExtensionFieldResponseDto[]>(
    "/metadata/fields",
    { params: { key: customerKey } },
  );
  return data;
}
