import { Injectable } from "@nestjs/common";

import { MceBridgeService } from "../mce-bridge.service";
import {
  buildIsRunningRequest,
  buildRowsetRequest,
} from "../rest/request-bodies";
import { IsRunningResponse, RowsetResponse } from "../rest/types";

@Injectable()
export class RestDataService {
  constructor(private readonly mceBridge: MceBridgeService) {}

  async getRowset(
    tenantId: string,
    userId: string,
    mid: string,
    dataExtensionName: string,
    page: number,
    pageSize: number,
  ): Promise<RowsetResponse> {
    const request = buildRowsetRequest({ dataExtensionName, page, pageSize });
    const response = await this.mceBridge.request<RowsetResponse>(
      tenantId,
      userId,
      mid,
      request,
    );
    return response;
  }

  async checkIsRunning(
    tenantId: string,
    userId: string,
    mid: string,
    queryId: string,
  ): Promise<IsRunningResponse> {
    const request = buildIsRunningRequest(queryId);
    const response = await this.mceBridge.request<IsRunningResponse>(
      tenantId,
      userId,
      mid,
      request,
    );
    return response;
  }
}
