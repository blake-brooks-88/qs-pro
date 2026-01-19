import { Injectable } from "@nestjs/common";

import { MceOperationError, McePaginationError } from "../errors";
import { MceBridgeService } from "../mce-bridge.service";
import {
  buildContinueRequest,
  buildCreateQueryDefinition,
  buildDeleteQueryDefinition,
  buildPerformQueryDefinition,
  buildRetrieveQueryDefinition,
} from "../soap/request-bodies";
import {
  SoapCreateResponse,
  SoapDeleteResponse,
  SoapPerformResponse,
  SoapRetrieveResponse,
} from "../soap/types";

const MAX_PAGES = 10;

export interface QueryDefinition {
  objectId: string;
  customerKey: string;
  name: string;
  categoryId?: number;
}

export interface CreateQueryDefinitionParams {
  name: string;
  customerKey: string;
  categoryId: number;
  targetId: string;
  targetCustomerKey: string;
  targetName: string;
  queryText: string;
}

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
    );

    const msg = response.Body?.RetrieveResponseMsg;
    const status = msg?.OverallStatus;

    if (status && status !== "OK" && status !== "MoreDataAvailable") {
      if (status === "Error" && !msg?.Results) {
        return null;
      }
      throw new MceOperationError("RetrieveQueryDefinition", status);
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
        throw new MceOperationError("RetrieveQueryDefinitionByFolder", status);
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
      );
    currentRequestId = processResponse(firstResponse);
    page++;

    while (currentRequestId) {
      if (page >= MAX_PAGES) {
        throw new McePaginationError(
          "RetrieveQueryDefinitionByFolder",
          MAX_PAGES,
        );
      }

      const continueBody = buildContinueRequest(currentRequestId);
      const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        continueBody,
        "Retrieve",
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
    );

    const result = response.Body?.CreateResponse?.Results;
    if (result?.StatusCode !== "OK") {
      throw new MceOperationError(
        "CreateQueryDefinition",
        result?.StatusCode ?? "Unknown",
        result?.StatusMessage,
      );
    }

    const objectId = result?.NewObjectID;
    if (!objectId || typeof objectId !== "string") {
      throw new MceOperationError(
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
    );

    const result = response.Body?.PerformResponseMsg?.Results?.Result;
    const task = result?.Task;

    if (task?.StatusCode !== "OK" && result?.StatusCode !== "OK") {
      throw new MceOperationError(
        "PerformQueryDefinition",
        task?.StatusCode ?? result?.StatusCode ?? "Unknown",
        task?.StatusMessage ?? result?.StatusMessage,
      );
    }

    const taskId = result?.TaskID ?? task?.ID;
    if (!taskId) {
      throw new MceOperationError(
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
    );

    const result = response.Body?.DeleteResponse?.Results;
    if (result?.StatusCode && result.StatusCode !== "OK") {
      throw new MceOperationError(
        "DeleteQueryDefinition",
        result.StatusCode,
        result.StatusMessage,
      );
    }
  }
}
