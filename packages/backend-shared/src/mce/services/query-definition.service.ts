import { Injectable } from "@nestjs/common";

import { AppError, ErrorCode } from "../../common/errors";
import { MCE_TIMEOUTS } from "../http-timeout.config";
import { MceBridgeService } from "../mce-bridge.service";
import { mceSoapFailure } from "../mce-errors";
import {
  buildContinueRequest,
  buildCreateQueryDefinition,
  buildDeleteQueryDefinition,
  buildPerformQueryDefinition,
  buildRetrieveQueryDefinition,
  buildRetrieveQueryDefinitionByNameAndFolder,
} from "../soap/request-bodies";
import {
  SoapCreateResponse,
  SoapDeleteResponse,
  SoapPerformResponse,
  SoapRetrieveResponse,
} from "../soap/types";
import type {
  CreateQueryDefinitionParams,
  QueryDefinition,
} from "../types/query-definition";

const MAX_PAGES = 10;

export type { CreateQueryDefinitionParams, QueryDefinition };

@Injectable()
export class QueryDefinitionService {
  constructor(private readonly mceBridge: MceBridgeService) {}

  async retrieve(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<QueryDefinition | null> {
    const soapBody = buildRetrieveQueryDefinition(customerKey);

    const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Retrieve",
      MCE_TIMEOUTS.METADATA,
    );

    const msg = response.Body?.RetrieveResponseMsg;
    const status = msg?.OverallStatus;

    if (status && status !== "OK" && status !== "MoreDataAvailable") {
      if (status === "Error" && !msg?.Results) {
        return null;
      }
      throw mceSoapFailure("RetrieveQueryDefinition", status);
    }

    const rawResults = msg?.Results;
    if (!rawResults) {
      return null;
    }

    const item = Array.isArray(rawResults) ? rawResults[0] : rawResults;
    if (!item) {
      return null;
    }

    return {
      objectId: String(item.ObjectID ?? ""),
      customerKey: String(item.CustomerKey ?? ""),
      name: String(item.Name ?? ""),
      categoryId: item.CategoryID
        ? parseInt(String(item.CategoryID), 10)
        : undefined,
    };
  }

  async retrieveByNameAndFolder(
    tenantId: string,
    userId: string,
    mid: string,
    name: string,
    categoryId?: number,
  ): Promise<QueryDefinition | null> {
    const soapBody = buildRetrieveQueryDefinitionByNameAndFolder({
      name,
      categoryId,
    });

    const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Retrieve",
      MCE_TIMEOUTS.METADATA,
    );

    const msg = response.Body?.RetrieveResponseMsg;
    const status = msg?.OverallStatus;

    if (status && status !== "OK" && status !== "MoreDataAvailable") {
      if (status === "Error" && !msg?.Results) {
        return null;
      }
      throw mceSoapFailure("RetrieveQueryDefinitionByNameAndFolder", status);
    }

    const rawResults = msg?.Results;
    if (!rawResults) {
      return null;
    }

    const item = Array.isArray(rawResults) ? rawResults[0] : rawResults;
    if (!item) {
      return null;
    }

    return {
      objectId: String(item.ObjectID ?? ""),
      customerKey: String(item.CustomerKey ?? ""),
      name: String(item.Name ?? ""),
      categoryId: item.CategoryID
        ? parseInt(String(item.CategoryID), 10)
        : undefined,
    };
  }

  async retrieveByFolder(
    tenantId: string,
    userId: string,
    mid: string,
    folderId: number,
    olderThan?: Date,
  ): Promise<QueryDefinition[]> {
    const filterParts: string[] = [];

    filterParts.push(`
      <LeftOperand xsi:type="SimpleFilterPart">
        <Property>CategoryID</Property>
        <SimpleOperator>equals</SimpleOperator>
        <Value>${folderId}</Value>
      </LeftOperand>`);

    if (olderThan) {
      filterParts.push(`
      <LogicalOperator>AND</LogicalOperator>
      <RightOperand xsi:type="SimpleFilterPart">
        <Property>CreatedDate</Property>
        <SimpleOperator>lessThan</SimpleOperator>
        <Value>${olderThan.toISOString()}</Value>
      </RightOperand>`);
    }

    const initialSoapBody = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
        <RetrieveRequest>
          <ObjectType>QueryDefinition</ObjectType>
          <Properties>ObjectID</Properties>
          <Properties>CustomerKey</Properties>
          <Properties>Name</Properties>
          <Properties>CategoryID</Properties>
          <Filter xsi:type="${olderThan ? "ComplexFilterPart" : "SimpleFilterPart"}">
            ${
              olderThan
                ? filterParts.join("")
                : `
            <Property>CategoryID</Property>
            <SimpleOperator>equals</SimpleOperator>
            <Value>${folderId}</Value>`
            }
          </Filter>
        </RetrieveRequest>
      </RetrieveRequestMsg>`;

    const results: QueryDefinition[] = [];
    let currentRequestId: string | undefined;
    let page = 0;

    const processResponse = (
      response: SoapRetrieveResponse,
    ): string | undefined => {
      const msg = response.Body?.RetrieveResponseMsg;
      const status = msg?.OverallStatus;

      if (status && status !== "OK" && status !== "MoreDataAvailable") {
        throw mceSoapFailure("RetrieveQueryDefinitionByFolder", status);
      }

      const rawResults = msg?.Results;
      if (rawResults) {
        const items = Array.isArray(rawResults) ? rawResults : [rawResults];
        for (const item of items) {
          results.push({
            objectId: String(item.ObjectID ?? ""),
            customerKey: String(item.CustomerKey ?? ""),
            name: String(item.Name ?? ""),
            categoryId: item.CategoryID
              ? parseInt(String(item.CategoryID), 10)
              : undefined,
          });
        }
      }

      return status === "MoreDataAvailable" ? msg?.RequestID : undefined;
    };

    const firstResponse =
      await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        initialSoapBody,
        "Retrieve",
        MCE_TIMEOUTS.METADATA,
      );
    currentRequestId = processResponse(firstResponse);
    page++;

    while (currentRequestId) {
      if (page >= MAX_PAGES) {
        throw new AppError(ErrorCode.MCE_PAGINATION_EXCEEDED, undefined, {
          operation: "RetrieveQueryDefinitionByFolder",
          maxPages: MAX_PAGES,
        });
      }

      const continueBody = buildContinueRequest(currentRequestId);
      const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        continueBody,
        "Retrieve",
        MCE_TIMEOUTS.METADATA,
      );
      currentRequestId = processResponse(response);
      page++;
    }

    return results;
  }

  async create(
    tenantId: string,
    userId: string,
    mid: string,
    params: CreateQueryDefinitionParams,
  ): Promise<{ objectId: string }> {
    const soapBody = buildCreateQueryDefinition(params);

    const response = await this.mceBridge.soapRequest<SoapCreateResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Create",
      MCE_TIMEOUTS.METADATA,
    );

    const result = response.Body?.CreateResponse?.Results;
    if (result?.StatusCode !== "OK") {
      throw mceSoapFailure(
        "CreateQueryDefinition",
        result?.StatusCode ?? "Unknown",
        result?.StatusMessage,
      );
    }

    const objectId = result?.NewObjectID;
    if (!objectId || typeof objectId !== "string") {
      throw mceSoapFailure(
        "CreateQueryDefinition",
        "NoObjectID",
        "Query Definition created but no ObjectID returned",
      );
    }

    return { objectId };
  }

  async perform(
    tenantId: string,
    userId: string,
    mid: string,
    objectId: string,
  ): Promise<{ taskId: string }> {
    const soapBody = buildPerformQueryDefinition(objectId);

    const response = await this.mceBridge.soapRequest<SoapPerformResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Perform",
      MCE_TIMEOUTS.QUEUE_JOB,
    );

    const result = response.Body?.PerformResponseMsg?.Results?.Result;
    const task = result?.Task;

    if (task?.StatusCode !== "OK" && result?.StatusCode !== "OK") {
      throw mceSoapFailure(
        "PerformQueryDefinition",
        task?.StatusCode ?? result?.StatusCode ?? "Unknown",
        task?.StatusMessage ?? result?.StatusMessage,
      );
    }

    const taskId = result?.TaskID ?? task?.ID;
    if (!taskId) {
      throw mceSoapFailure(
        "PerformQueryDefinition",
        "NoTaskID",
        "Query performed but no TaskID returned",
      );
    }

    return { taskId };
  }

  async delete(
    tenantId: string,
    userId: string,
    mid: string,
    objectId: string,
  ): Promise<void> {
    const soapBody = buildDeleteQueryDefinition(objectId);

    const response = await this.mceBridge.soapRequest<SoapDeleteResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Delete",
      MCE_TIMEOUTS.METADATA,
    );

    const result = response.Body?.DeleteResponse?.Results;
    if (result?.StatusCode && result.StatusCode !== "OK") {
      throw mceSoapFailure(
        "DeleteQueryDefinition",
        result.StatusCode,
        result.StatusMessage,
      );
    }
  }
}
