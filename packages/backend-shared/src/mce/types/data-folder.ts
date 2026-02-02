export interface DataFolder {
  id: number;
  name: string;
  parentFolderId?: number;
}

export interface RetrieveDataFolderParams {
  name?: string;
  contentType?: string;
  clientId?: string;
}

export interface CreateDataFolderParams {
  name: string;
  parentFolderId: number;
  contentType: string;
}
