import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";
import * as cacheManager from "cache-manager";

import { MCE_TIMEOUTS } from "./http-timeout.config";
import { MceBridgeService } from "./mce-bridge.service";
import type { CreateDataExtensionParams } from "./services/data-extension.service";
import { DataExtensionService } from "./services/data-extension.service";
import {
  buildContinueRequest,
  buildRetrieveDataExtensionFields,
  buildRetrieveDataExtensions,
  buildRetrieveDataFolder,
} from "./soap/request-bodies";

interface MceSoapFolder {
  ID: string | number;
  Name: string;
  ParentFolder?: {
    ID: string | number;
  };
  Description?: string;
  [key: string]: unknown;
}

interface MceSoapResponse {
  Body?: {
    RetrieveResponseMsg?: {
      OverallStatus?: string;
      RequestID?: string;
      Results?: unknown[];
    };
  };
}

@Injectable()
export class MetadataService {
  constructor(
    private bridge: MceBridgeService,
    private dataExtensionService: DataExtensionService,
    @Inject(CACHE_MANAGER) private cacheManager: cacheManager.Cache,
  ) {}

  async getFolders(
    tenantId: string,
    userId: string,
    mid: string,
    eid?: string,
    contentType?: string,
  ): Promise<unknown> {
    const effectiveContentType = contentType ?? "dataextension";
    const cacheKey = `folders:${tenantId}:${mid}:${effectiveContentType}:${eid ?? "local"}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    const localPromise = this.fetchFolders(
      tenantId,
      userId,
      mid,
      undefined,
      effectiveContentType,
    );
    const sharedPromise = eid
      ? this.fetchFolders(tenantId, userId, mid, eid, effectiveContentType)
      : Promise.resolve([]);

    const [local, shared] = await Promise.all([localPromise, sharedPromise]);
    const merged = this.dedupeFolders([...local, ...shared]);

    // Cache for 10 minutes (600000ms)
    await this.cacheManager.set(cacheKey, merged, 600000);

    return merged;
  }

  private async fetchFolders(
    tenantId: string,
    userId: string,
    mid: string,
    clientId?: string,
    contentType?: string,
  ): Promise<MceSoapFolder[]> {
    let allFolders: MceSoapFolder[] = [];
    let continueRequestId: string | null = null;
    let page = 1;
    const MAX_PAGES = 50;

    do {
      const soapBody = continueRequestId
        ? buildContinueRequest(continueRequestId)
        : buildRetrieveDataFolder({
            contentType: contentType ?? "dataextension",
            clientId,
          });

      const response = (await this.bridge.soapRequest(
        tenantId,
        userId,
        mid,
        soapBody,
        "Retrieve",
        MCE_TIMEOUTS.METADATA,
      )) as MceSoapResponse;

      const retrieveResponse = response?.Body?.RetrieveResponseMsg;
      const results = retrieveResponse?.Results ?? [];
      const folders = (
        Array.isArray(results) ? results : [results]
      ) as MceSoapFolder[];

      allFolders = allFolders.concat(folders);

      const status = retrieveResponse?.OverallStatus;
      continueRequestId =
        status === "MoreDataAvailable"
          ? (retrieveResponse?.RequestID ?? null)
          : null;
      page++;
    } while (continueRequestId && page <= MAX_PAGES);

    if (!clientId) {
      return allFolders;
    }

    return allFolders.map((folder) => {
      const name = typeof folder.Name === "string" ? folder.Name : null;
      const rawParentId = folder?.ParentFolder?.ID ?? null;
      const parentId =
        rawParentId !== null && rawParentId !== undefined
          ? String(rawParentId).trim()
          : "";
      const isRoot = parentId === "" || parentId === "0";
      if (isRoot && name && name.toLowerCase() === "data extensions") {
        return { ...folder, Name: "Shared" };
      }
      return folder;
    });
  }

  private dedupeFolders(folders: MceSoapFolder[]): MceSoapFolder[] {
    const seen = new Map<string, MceSoapFolder>();
    const deduped: MceSoapFolder[] = [];

    folders.forEach((folder) => {
      const rawId = folder.ID ?? folder.Id ?? folder.id;
      const id =
        rawId !== null && rawId !== undefined ? String(rawId as string) : null;
      if (!id) {
        deduped.push(folder);
        return;
      }
      if (seen.has(id)) {
        return;
      }
      seen.set(id, folder);
      deduped.push(folder);
    });

    return deduped;
  }

  async getDataExtensions(
    tenantId: string,
    userId: string,
    mid: string,
    eid: string,
  ): Promise<unknown[]> {
    // 1. Local DEs
    const localPromise = this.fetchDataExtensions(tenantId, userId, mid);

    // 2. Shared DEs (Context of Enterprise)
    const sharedPromise = this.fetchDataExtensions(tenantId, userId, mid, eid);

    const [local, shared] = await Promise.all([localPromise, sharedPromise]);

    return [...local, ...shared];
  }

  private async fetchDataExtensions(
    tenantId: string,
    userId: string,
    mid: string,
    clientId?: string,
  ): Promise<unknown[]> {
    let allDEs: unknown[] = [];
    let continueRequestId: string | null = null;
    let page = 1;
    const MAX_PAGES = 50;

    do {
      const soapBody = continueRequestId
        ? buildContinueRequest(continueRequestId)
        : buildRetrieveDataExtensions(clientId);

      const response = (await this.bridge.soapRequest(
        tenantId,
        userId,
        mid,
        soapBody,
        "Retrieve",
        MCE_TIMEOUTS.METADATA,
      )) as MceSoapResponse;

      const retrieveResponse = response?.Body?.RetrieveResponseMsg;
      const results = retrieveResponse?.Results ?? [];
      const des = Array.isArray(results) ? results : [results];

      allDEs = allDEs.concat(des);

      const status = retrieveResponse?.OverallStatus;
      continueRequestId =
        status === "MoreDataAvailable"
          ? (retrieveResponse?.RequestID ?? null)
          : null;
      page++;
    } while (continueRequestId && page <= MAX_PAGES);

    return allDEs;
  }

  async getFields(
    tenantId: string,
    userId: string,
    mid: string,
    deKey: string,
    eid?: string,
  ): Promise<unknown[]> {
    const cacheKey = `fields:${tenantId}:${mid}:${deKey}:${eid ?? "local"}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached as unknown[];
    }

    const soapBody = buildRetrieveDataExtensionFields({
      customerKey: deKey,
      clientId: eid,
    });

    const response = (await this.bridge.soapRequest(
      tenantId,
      userId,
      mid,
      soapBody,
      "Retrieve",
      MCE_TIMEOUTS.METADATA,
    )) as MceSoapResponse;
    const results = response?.Body?.RetrieveResponseMsg?.Results ?? [];
    const fields = Array.isArray(results) ? results : [results];

    // Cache for 30 minutes (1800000ms)
    await this.cacheManager.set(cacheKey, fields, 1800000);

    return fields;
  }

  async createDataExtension(
    tenantId: string,
    userId: string,
    mid: string,
    params: CreateDataExtensionParams,
  ): Promise<{ objectId: string }> {
    return this.dataExtensionService.create(tenantId, userId, mid, params);
  }
}
