import { Injectable } from "@nestjs/common";

import { MceBridgeService } from "../mce-bridge.service";
import { buildRetrieveAsyncActivityStatus } from "../soap/request-bodies";
import { SoapAsyncStatusResponse } from "../soap/types";

export interface AsyncStatus {
  status?: string;
  errorMsg?: string;
  completedDate?: string;
}

@Injectable()
export class AsyncStatusService {
  constructor(private readonly mceBridge: MceBridgeService) {}

  async retrieve(
    tenantId: string,
    userId: string,
    mid: string,
    taskId: string,
  ): Promise<AsyncStatus> {
    const soapBody = buildRetrieveAsyncActivityStatus(taskId);

    const response = await this.mceBridge.soapRequest<SoapAsyncStatusResponse>(
      tenantId,
      userId,
      mid,
      soapBody,
      "Retrieve",
    );

    const result = response.Body?.RetrieveResponseMsg?.Results;
    const rawProperties = result?.Properties?.Property;

    if (!rawProperties) {
      if (result?.Status || result?.ErrorMsg) {
        return {
          status: result.Status,
          errorMsg: result.ErrorMsg,
        };
      }
      return {};
    }

    const properties = Array.isArray(rawProperties)
      ? rawProperties
      : [rawProperties];

    const statusProp = properties.find((p) => p.Name === "Status");
    const errorMsgProp = properties.find((p) => p.Name === "ErrorMsg");
    const completedDateProp = properties.find(
      (p) => p.Name === "CompletedDate",
    );

    return {
      status: statusProp?.Value ?? result?.Status,
      errorMsg: errorMsgProp?.Value ?? result?.ErrorMsg,
      completedDate: completedDateProp?.Value,
    };
  }
}
