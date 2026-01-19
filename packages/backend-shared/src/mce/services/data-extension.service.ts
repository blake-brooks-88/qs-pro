import { Injectable } from "@nestjs/common";

import { MceOperationError, McePaginationError } from "../errors";
import { MceBridgeService } from "../mce-bridge.service";
import {
  buildContinueRequest,
  buildCreateDataExtension,
  buildDeleteDataExtension,
  buildRetrieveDataExtensionFields,
  buildRetrieveDataExtensions,
} from "../soap/request-bodies";
import {
  SoapCreateResponse,
  SoapDeleteResponse,
  SoapRetrieveResponse,
} from "../soap/types";

const MAX_PAGES = 10;

export interface DataExtension {
  name: string;
  customerKey: string;
  objectId: string;
}

export interface DataExtensionField {
  name: string;
  fieldType: string;
  maxLength?: number;
}

export interface CreateDataExtensionParams {
  name: string;
  customerKey: string;
  categoryId: number;
  fields: Array<{
    name: string;
    fieldType: string;
    maxLength?: number;
    scale?: number;
    precision?: number;
    isPrimaryKey?: boolean;
  }>;
}

@Injectable()
export class DataExtensionService {
  constructor(private readonly mceBridge: MceBridgeService) {}

  async retrieveAll(
    tenantId: string,
    userId: string,
    mid: string,
    clientId?: string,
  ): Promise<DataExtension[]> {
    const results: DataExtension[] = [];
    let requestId: string | undefined;
    let page = 0;

    do {
      const soapBody = requestId
        ? buildContinueRequest(requestId)
        : buildRetrieveDataExtensions(clientId);

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
        throw new MceOperationError("RetrieveDataExtensions", status);
      }

      const rawResults = msg?.Results;
      if (rawResults) {
        const items = Array.isArray(rawResults) ? rawResults : [rawResults];
        for (const item of items) {
          results.push({
            name: String(item.Name ?? ""),
            customerKey: String(item.CustomerKey ?? ""),
            objectId: String(item.ObjectID ?? ""),
          });
        }
      }

      requestId = status === "MoreDataAvailable" ? msg?.RequestID : undefined;
      page++;

      if (page >= MAX_PAGES && requestId) {
        throw new McePaginationError("RetrieveDataExtensions", MAX_PAGES);
      }
    } while (requestId);

    return results;
  }

  async retrieveFields(
    tenantId: string,
    userId: string,
    mid: string,
    dataExtensionName: string,
  ): Promise<DataExtensionField[]> {
    const soapBody = buildRetrieveDataExtensionFields(dataExtensionName);

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
      throw new MceOperationError("RetrieveDataExtensionFields", status);
    }

    const rawResults = msg?.Results;
    if (!rawResults) {
      return [];
    }

    const items = Array.isArray(rawResults) ? rawResults : [rawResults];
    return items.map((item) => ({
      name: String(item.Name ?? ""),
      fieldType: String(item.FieldType ?? "Text"),
      maxLength: item.MaxLength
        ? parseInt(String(item.MaxLength), 10)
        : undefined,
    }));
  }

  async create(
    tenantId: string,
    userId: string,
    mid: string,
    params: CreateDataExtensionParams,
  ): Promise<{ objectId: string }> {
    const soapBody = buildCreateDataExtension(params);

    const response = await this.mceBridge.soapRequest<SoapCreateResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Create",
    );

    const result = response.Body?.CreateResponse?.Results;
    if (result?.StatusCode !== "OK") {
      throw new MceOperationError(
        "CreateDataExtension",
        result?.StatusCode ?? "Unknown",
        result?.StatusMessage,
      );
    }

    const objectId = result?.NewObjectID;
    if (!objectId || typeof objectId !== "string") {
      throw new MceOperationError(
        "CreateDataExtension",
        "NoObjectID",
        "Data Extension created but no ObjectID returned",
      );
    }

    return { objectId };
  }

  async delete(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<void> {
    const soapBody = buildDeleteDataExtension(customerKey);

    const response = await this.mceBridge.soapRequest<SoapDeleteResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Delete",
    );

    const result = response.Body?.DeleteResponse?.Results;
    if (result?.StatusCode && result.StatusCode !== "OK") {
      throw new MceOperationError(
        "DeleteDataExtension",
        result.StatusCode,
        result.StatusMessage,
      );
    }
  }
}
