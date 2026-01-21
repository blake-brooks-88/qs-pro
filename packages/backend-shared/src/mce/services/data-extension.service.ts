import { Injectable } from "@nestjs/common";

import { AppError, ErrorCode } from "../../common/errors";
import { MceBridgeService } from "../mce-bridge.service";
import { mceSoapFailure } from "../mce-errors";
import {
  buildContinueRequest,
  buildCreateDataExtension,
  buildDeleteDataExtension,
  buildRetrieveDataExtensionByName,
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
  isPrimaryKey?: boolean;
  isRequired?: boolean;
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
        throw mceSoapFailure("RetrieveDataExtensions", status);
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
        throw new AppError(ErrorCode.MCE_PAGINATION_EXCEEDED, undefined, {
          operation: "RetrieveDataExtensions",
          maxPages: MAX_PAGES,
        });
      }
    } while (requestId);

    return results;
  }

  async retrieveByName(
    tenantId: string,
    userId: string,
    mid: string,
    name: string,
  ): Promise<DataExtension | null> {
    const soapBody = buildRetrieveDataExtensionByName(name);

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
      throw mceSoapFailure("RetrieveDataExtensionByName", status);
    }

    const rawResults = msg?.Results;
    if (!rawResults) {
      return null;
    }

    const items = Array.isArray(rawResults) ? rawResults : [rawResults];
    const item = items[0];
    if (!item) {
      return null;
    }

    return {
      name: String(item.Name ?? ""),
      customerKey: String(item.CustomerKey ?? ""),
      objectId: String(item.ObjectID ?? ""),
    };
  }

  async retrieveFields(
    tenantId: string,
    userId: string,
    mid: string,
    dataExtensionName: string,
  ): Promise<DataExtensionField[]> {
    // First, get the CustomerKey by looking up the DE by name
    // (DataExtensionField can only be filtered by DataExtension.CustomerKey, not Name)
    const dataExtension = await this.retrieveByName(
      tenantId,
      userId,
      mid,
      dataExtensionName,
    );

    if (!dataExtension) {
      return [];
    }

    const soapBody = buildRetrieveDataExtensionFields({
      customerKey: dataExtension.customerKey,
    });

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
      throw mceSoapFailure("RetrieveDataExtensionFields", status);
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
      isPrimaryKey: item.IsPrimaryKey === "true",
      isRequired: item.IsRequired === "true",
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
      throw mceSoapFailure(
        "CreateDataExtension",
        result?.StatusCode ?? "Unknown",
        result?.StatusMessage,
      );
    }

    const objectId = result?.NewObjectID;
    if (!objectId || typeof objectId !== "string") {
      throw mceSoapFailure(
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
      throw mceSoapFailure(
        "DeleteDataExtension",
        result.StatusCode,
        result.StatusMessage,
      );
    }
  }
}
