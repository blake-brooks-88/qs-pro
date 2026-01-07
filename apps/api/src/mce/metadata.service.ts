import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as cacheManager from 'cache-manager';
import { MceBridgeService } from './mce-bridge.service';

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
    @Inject(CACHE_MANAGER) private cacheManager: cacheManager.Cache,
  ) {}

  async getFolders(
    tenantId: string,
    userId: string,
    mid: string,
    eid?: string,
  ): Promise<unknown> {
    const cacheKey = eid
      ? `folders:${tenantId}:${mid}:${eid}`
      : `folders:${tenantId}:${mid}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const localPromise = this.fetchFolders(tenantId, userId, mid);
    const sharedPromise = eid
      ? this.fetchFolders(tenantId, userId, mid, eid)
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
  ): Promise<MceSoapFolder[]> {
    const clientContext = clientId
      ? `
      <ClientIDs>
        <ClientID>${clientId}</ClientID>
      </ClientIDs>
    `
      : '';

    let allFolders: MceSoapFolder[] = [];
    let continueRequest: string | null = null;
    let page = 1;
    const MAX_PAGES = 50;

    do {
      const soapBody = continueRequest
        ? `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ContinueRequest>${continueRequest}</ContinueRequest>
         </RetrieveRequest>
      </RetrieveRequestMsg>
    `
        : `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            ${clientContext}
            <ObjectType>DataFolder</ObjectType>
            <Properties>ID</Properties>
            <Properties>Name</Properties>
            <Properties>ParentFolder.ID</Properties>
            <Properties>Description</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>ContentType</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>dataextension</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>
    `;

      const response = (await this.bridge.soapRequest(
        tenantId,
        userId,
        mid,
        soapBody,
        'Retrieve',
      )) as MceSoapResponse;

      const retrieveResponse = response?.Body?.RetrieveResponseMsg;
      const results = retrieveResponse?.Results || [];
      const folders = (Array.isArray(results) ? results : [results]) as MceSoapFolder[];

      allFolders = allFolders.concat(folders);

      const status = retrieveResponse?.OverallStatus;
      continueRequest =
        status === 'MoreDataAvailable' ? retrieveResponse?.RequestID ?? null : null;
      page++;
    } while (continueRequest && page <= MAX_PAGES);

    if (!clientId) return allFolders;

    return allFolders.map((folder) => {
      const name = typeof folder.Name === 'string' ? folder.Name : null;
      const rawParentId = folder?.ParentFolder?.ID ?? null;
      const parentId =
        rawParentId !== null && rawParentId !== undefined
          ? String(rawParentId).trim()
          : '';
      const isRoot = parentId === '' || parentId === '0';
      if (isRoot && name && name.toLowerCase() === 'data extensions') {
        return { ...folder, Name: 'Shared' };
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
      if (seen.has(id)) return;
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
    const clientContext = clientId
      ? `
      <ClientIDs>
        <ClientID>${clientId}</ClientID>
      </ClientIDs>
    `
      : '';

    let allDEs: unknown[] = [];
    let continueRequest: string | null = null;
    let page = 1;
    const MAX_PAGES = 50;

    do {
      const soapBody = continueRequest
        ? `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ContinueRequest>${continueRequest}</ContinueRequest>
         </RetrieveRequest>
      </RetrieveRequestMsg>
    `
        : `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            ${clientContext}
            <ObjectType>DataExtension</ObjectType>
            <Properties>CustomerKey</Properties>
            <Properties>Name</Properties>
            <Properties>CategoryID</Properties>
            <Properties>IsSendable</Properties>
         </RetrieveRequest>
      </RetrieveRequestMsg>
    `;

      const response = (await this.bridge.soapRequest(
        tenantId,
        userId,
        mid,
        soapBody,
        'Retrieve',
      )) as MceSoapResponse;

      const retrieveResponse = response?.Body?.RetrieveResponseMsg;
      const results = retrieveResponse?.Results || [];
      const des = Array.isArray(results) ? results : [results];

      allDEs = allDEs.concat(des);

      const status = retrieveResponse?.OverallStatus;
      continueRequest =
        status === 'MoreDataAvailable' ? retrieveResponse?.RequestID ?? null : null;
      page++;
    } while (continueRequest && page <= MAX_PAGES);

    return allDEs;
  }

  async getFields(
    tenantId: string,
    userId: string,
    mid: string,
    deKey: string,
  ): Promise<unknown[]> {
    const cacheKey = `fields:${tenantId}:${mid}:${deKey}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached as unknown[];

    const soapBody = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>DataExtensionField</ObjectType>
            <Properties>Name</Properties>
            <Properties>FieldType</Properties>
            <Properties>MaxLength</Properties>
            <Properties>IsPrimaryKey</Properties>
            <Properties>IsRequired</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>DataExtension.CustomerKey</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>${deKey}</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>
    `;

    const response = (await this.bridge.soapRequest(
      tenantId,
      userId,
      mid,
      soapBody,
      'Retrieve',
    )) as MceSoapResponse;
    const results = response?.Body?.RetrieveResponseMsg?.Results || [];
    const fields = Array.isArray(results) ? results : [results];

    // Cache for 30 minutes (1800000ms)
    await this.cacheManager.set(cacheKey, fields, 1800000);

    return fields;
  }
}
