import { Injectable } from "@nestjs/common";

import { AppError, ErrorCode } from "../../common/errors";
import { MceBridgeService } from "../mce-bridge.service";
import { mceSoapFailure } from "../mce-errors";
import {
  buildContinueRequest,
  buildCreateDataFolder,
  buildRetrieveDataFolder,
} from "../soap/request-bodies";
import { SoapCreateResponse, SoapRetrieveResponse } from "../soap/types";

const MAX_PAGES = 10;

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

@Injectable()
export class DataFolderService {
  constructor(private readonly mceBridge: MceBridgeService) {}

  async retrieve(
    tenantId: string,
    userId: string,
    mid: string,
    params: RetrieveDataFolderParams,
  ): Promise<DataFolder[]> {
    const results: DataFolder[] = [];
    let requestId: string | undefined;
    let page = 0;

    do {
      const soapBody = requestId
        ? buildContinueRequest(requestId)
        : buildRetrieveDataFolder(params);

      const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        soapBody,
        "Retrieve",
      );

      const msg = response.Body?.RetrieveResponseMsg;
      const status = msg?.OverallStatus;

      if (status && status !== "OK" && status !== "MoreDataAvailable") {
        throw mceSoapFailure("RetrieveDataFolder", status);
      }

      const rawResults = msg?.Results;
      if (rawResults) {
        const items = Array.isArray(rawResults) ? rawResults : [rawResults];
        for (const item of items) {
          const folder: DataFolder = {
            id: parseInt(String(item.ID ?? "0"), 10),
            name: String(item.Name ?? ""),
          };
          if (item.ParentFolder && typeof item.ParentFolder === "object") {
            const parentFolder = item.ParentFolder as { ID?: string };
            if (parentFolder.ID) {
              folder.parentFolderId = parseInt(parentFolder.ID, 10);
            }
          }
          results.push(folder);
        }
      }

      requestId = status === "MoreDataAvailable" ? msg?.RequestID : undefined;
      page++;

      if (page >= MAX_PAGES && requestId) {
        throw new AppError(ErrorCode.MCE_PAGINATION_EXCEEDED, undefined, {
          operation: "RetrieveDataFolder",
          maxPages: MAX_PAGES,
        });
      }
    } while (requestId);

    return results;
  }

  async create(
    tenantId: string,
    userId: string,
    mid: string,
    params: CreateDataFolderParams,
  ): Promise<{ id: number }> {
    const soapBody = buildCreateDataFolder(params);

    const response = await this.mceBridge.soapRequest<SoapCreateResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Create",
    );

    const result = response.Body?.CreateResponse?.Results;
    if (result?.StatusCode !== "OK") {
      throw mceSoapFailure(
        "CreateDataFolder",
        result?.StatusCode ?? "Unknown",
        result?.StatusMessage,
      );
    }

    const newId = result?.NewID;
    if (!newId) {
      throw mceSoapFailure(
        "CreateDataFolder",
        "NoID",
        "Data Folder created but no ID returned",
      );
    }

    return { id: parseInt(newId, 10) };
  }
}
