import { Inject, Injectable, Logger } from "@nestjs/common";
import { MceBridgeService } from "@qs-pro/backend-shared";
import {
  and,
  eq,
  type PostgresJsDatabase,
  tenantSettings,
} from "@qs-pro/database";

interface SoapRetrieveResponse {
  Body?: {
    RetrieveResponseMsg?: {
      Results?:
        | { ObjectID?: string; CustomerKey?: string }
        | { ObjectID?: string; CustomerKey?: string }[];
    };
  };
}

@Injectable()
export class QueryDefinitionService {
  private readonly logger = new Logger(QueryDefinitionService.name);

  constructor(
    private readonly mceBridge: MceBridgeService,
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
  ) {}

  /**
   * Delete a QueryDefinition by its CustomerKey.
   * Looks up the QPP folder from tenantSettings and uses folder-based retrieval.
   * MCE SOAP API requires ObjectID for QueryDefinition deletes.
   *
   * @returns true if deleted, false if not found
   * @throws Error on SOAP request failures
   */
  async deleteByCustomerKey(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<boolean> {
    // Look up qppFolderId from tenantSettings
    const settings = await this.db
      .select({ qppFolderId: tenantSettings.qppFolderId })
      .from(tenantSettings)
      .where(
        and(
          eq(tenantSettings.tenantId, tenantId),
          eq(tenantSettings.mid, mid),
        ),
      )
      .limit(1);

    const folderId = settings[0]?.qppFolderId;

    const objectIdByKey = await this.retrieveObjectIdByCustomerKey(
      tenantId,
      userId,
      mid,
      customerKey,
    );

    // If found by CustomerKey, use that. Otherwise try folder+key as fallback.
    let objectIdByFolder: string | null = null;
    if (!objectIdByKey && folderId) {
      objectIdByFolder = await this.retrieveObjectIdByFolderAndKey(
        tenantId,
        userId,
        mid,
        folderId,
        customerKey,
      );
    }

    // Use whichever ObjectID we found
    const objectId = objectIdByKey ?? objectIdByFolder;
    if (!objectId) {
      this.logger.debug(
        `QueryDefinition ${customerKey} not found by any method, nothing to delete`,
      );
      return false;
    }

    return this.deleteByObjectId(tenantId, userId, mid, customerKey, objectId);
  }

  private async retrieveObjectIdByCustomerKey(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<string | null> {
    const retrieveSoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>ObjectID</Properties>
            <Properties>CustomerKey</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>CustomerKey</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>${this.escapeXml(customerKey)}</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
      tenantId,
      userId,
      mid,
      retrieveSoap,
      "Retrieve",
    );

    return this.extractObjectId(response);
  }

  private async retrieveObjectIdByFolderAndKey(
    tenantId: string,
    userId: string,
    mid: string,
    folderId: number,
    customerKey: string,
  ): Promise<string | null> {
    const retrieveSoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>ObjectID</Properties>
            <Properties>CustomerKey</Properties>
            <Filter xsi:type="ComplexFilterPart">
               <LeftOperand xsi:type="SimpleFilterPart">
                  <Property>CategoryID</Property>
                  <SimpleOperator>equals</SimpleOperator>
                  <Value>${folderId}</Value>
               </LeftOperand>
               <LogicalOperator>AND</LogicalOperator>
               <RightOperand xsi:type="SimpleFilterPart">
                  <Property>CustomerKey</Property>
                  <SimpleOperator>equals</SimpleOperator>
                  <Value>${this.escapeXml(customerKey)}</Value>
               </RightOperand>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    const response = await this.mceBridge.soapRequest<SoapRetrieveResponse>(
      tenantId,
      userId,
      mid,
      retrieveSoap,
      "Retrieve",
    );

    return this.extractObjectId(response);
  }

  private extractObjectId(response: SoapRetrieveResponse): string | null {
    const results = response.Body?.RetrieveResponseMsg?.Results;
    if (!results) {
      return null;
    }
    const queryDef = Array.isArray(results) ? results[0] : results;
    return queryDef?.ObjectID ?? null;
  }

  private async deleteByObjectId(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
    objectId: string,
  ): Promise<boolean> {
    const deleteSoap = `
      <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="QueryDefinition">
            <ObjectID>${objectId}</ObjectID>
         </Objects>
      </DeleteRequest>`;

    const deleteResponse = await this.mceBridge.soapRequest(
      tenantId,
      userId,
      mid,
      deleteSoap,
      "Delete",
    );

    this.logger.debug(
      `Delete QueryDefinition response for ${customerKey} (ObjectID: ${objectId}): ${JSON.stringify(deleteResponse)}`,
    );

    return true;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}
