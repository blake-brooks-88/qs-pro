import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import * as cacheManager from 'cache-manager';
import { MceBridgeService } from './mce-bridge.service';

@Injectable()
export class MetadataService {
  constructor(
    private bridge: MceBridgeService,
    @Inject(CACHE_MANAGER) private cacheManager: cacheManager.Cache,
  ) {}

  async getFolders(tenantId: string, userId: string) {
    const cacheKey = `folders:${tenantId}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    const soapBody = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
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

    const response = await this.bridge.soapRequest(
      tenantId,
      userId,
      soapBody,
      'Retrieve',
    );
    const results = response?.Body?.RetrieveResponseMsg?.Results || [];

    // Normalize if single result (SOAP quirk) - though array is typical from simple-xml parsers usually
    const folders = Array.isArray(results) ? results : [results];

    // Cache for 10 minutes (600000ms)
    await this.cacheManager.set(cacheKey, folders, 600000);

    return folders;
  }

  async getDataExtensions(tenantId: string, userId: string, eid: string) {
    // 1. Local DEs
    const localPromise = this.fetchDataExtensions(tenantId, userId);

    // 2. Shared DEs (Context of Enterprise)
    // To retrieve shared items, we often need to query QueryContext/ClientIDs or just base retrieval depending on visibility.
    // Standard pattern for Shared DEs in MCE often involves querying specific folders or using ClientID in the RetrieveRequest.
    // For now, we will assume a standard Retrieve with ClientID injection for the Shared context.
    const sharedPromise = this.fetchDataExtensions(tenantId, userId, eid);

    const [local, shared] = await Promise.all([localPromise, sharedPromise]);

    // Merge, potentially deduping by CustomerKey if needed, but usually they are distinct
    return [...local, ...shared];
  }

  private async fetchDataExtensions(
    tenantId: string,
    userId: string,
    clientId?: string,
  ) {
    const clientContext = clientId
      ? `
      <ClientIDs>
        <ClientID>${clientId}</ClientID>
      </ClientIDs>
    `
      : '';

    const soapBody = `
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

    const response = await this.bridge.soapRequest(
      tenantId,
      userId,
      soapBody,
      'Retrieve',
    );
    const results = response?.Body?.RetrieveResponseMsg?.Results || [];
    return Array.isArray(results) ? results : [results];
  }

  async getFields(tenantId: string, userId: string, deKey: string) {
    const cacheKey = `fields:${tenantId}:${deKey}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

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

    const response = await this.bridge.soapRequest(
      tenantId,
      userId,
      soapBody,
      'Retrieve',
    );
    const results = response?.Body?.RetrieveResponseMsg?.Results || [];
    const fields = Array.isArray(results) ? results : [results];

    // Cache for 30 minutes (1800000ms)
    await this.cacheManager.set(cacheKey, fields, 1800000);

    return fields;
  }
}
