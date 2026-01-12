import api from "@/services/api";
import { isPreviewModeEnabled } from "@/utils/preview-mode";
import {
  getDataExtensionsPreview,
  getFieldsPreview,
  getFoldersPreview,
} from "@/services/metadata.preview";
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

export async function getFolders(eid?: string): Promise<DataFolderResponseDto[]> {
  if (isPreviewModeEnabled()) {
    return getFoldersPreview();
  }
  const { data } = await api.get<DataFolderResponseDto[]>("/metadata/folders", {
    params: eid ? { eid } : undefined,
  });
  return data;
}

export async function getDataExtensions(
  eid: string,
): Promise<DataExtensionResponseDto[]> {
  if (isPreviewModeEnabled()) {
    return getDataExtensionsPreview(eid);
  }
  const { data } = await api.get<DataExtensionResponseDto[]>(
    "/metadata/data-extensions",
    { params: { eid } },
  );
  return data;
}

export async function getFields(
  customerKey: string,
): Promise<DataExtensionFieldResponseDto[]> {
  if (isPreviewModeEnabled()) {
    return getFieldsPreview(customerKey);
  }
  const { data } = await api.get<DataExtensionFieldResponseDto[]>(
    "/metadata/fields",
    { params: { key: customerKey } },
  );
  return data;
}
