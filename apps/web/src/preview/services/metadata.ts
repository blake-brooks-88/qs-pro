import type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
} from "@/services/metadata.types";
import { getSystemDataViewFields } from "@/services/system-data-views";
import previewCatalog from "@/preview/fixtures/preview-catalog.json";

export type {
  DataExtensionFieldResponseDto,
  DataExtensionResponseDto,
  DataFolderResponseDto,
};

type PreviewCatalog = {
  folders: DataFolderResponseDto[];
  dataExtensions: DataExtensionResponseDto[];
  fieldsByKey: Map<string, DataExtensionFieldResponseDto[]>;
};

function parsePreviewCatalog(json: unknown): PreviewCatalog {
  const data = json as {
    folders?: DataFolderResponseDto[];
    dataExtensions?: DataExtensionResponseDto[];
    fieldsByKey?: Record<string, DataExtensionFieldResponseDto[]>;
  };
  const fieldsByKey = new Map<string, DataExtensionFieldResponseDto[]>();
  if (data.fieldsByKey) {
    for (const [key, fields] of Object.entries(data.fieldsByKey)) {
      fieldsByKey.set(key, fields);
    }
  }
  return {
    folders: data.folders ?? [],
    dataExtensions: data.dataExtensions ?? [],
    fieldsByKey,
  };
}

const catalog = parsePreviewCatalog(previewCatalog);

export async function getFolders(
  _eid?: string,
): Promise<DataFolderResponseDto[]> {
  return catalog.folders;
}

export async function getDataExtensions(
  _eid: string,
): Promise<DataExtensionResponseDto[]> {
  return catalog.dataExtensions;
}

export async function getFields(
  customerKey: string,
): Promise<DataExtensionFieldResponseDto[]> {
  // Check if this is a system data view first
  const systemFields = getSystemDataViewFields(customerKey);
  if (systemFields.length > 0) {
    return systemFields;
  }
  return catalog.fieldsByKey.get(customerKey) ?? [];
}
