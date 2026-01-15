import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MceBridgeService } from "@qs-pro/backend-shared";
import { credentials } from "@qs-pro/database";
import { SoapRetrieveResponse } from "./shell-query.types";

@Injectable()
export class ShellQuerySweeper {
  private readonly logger = new Logger(ShellQuerySweeper.name);

  constructor(
    private readonly mceBridge: MceBridgeService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject("DATABASE") private readonly db: any,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleSweep() {
    this.logger.log("Starting hourly shell query asset sweep...");

    // 1. Get all tenants and their credentials to iterate
    // This is a bit brute-force. In a large system, we might want to
    // only sweep tenants that had activity in last 24h.
    const allCreds = await this.db.select().from(credentials);

    for (const cred of allCreds) {
      try {
        await this.sweepForTenantMid(cred.tenantId, cred.userId, cred.mid);
      } catch (e: unknown) {
        const err = e as { message?: string };
        this.logger.error(
          `Sweep failed for tenant ${cred.tenantId} MID ${cred.mid}: ${err.message || "Unknown error"}`,
        );
      }
    }

    this.logger.log("Shell query asset sweep completed.");
  }

  private async sweepForTenantMid(
    tenantId: string,
    userId: string,
    mid: string,
  ) {
    // 1. Find the "QueryPlusPlus Results" folder
    const searchSoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>DataFolder</ObjectType>
            <Properties>ID</Properties>
            <Filter xsi:type="SimpleFilterPart">
               <Property>Name</Property>
               <SimpleOperator>equals</SimpleOperator>
               <Value>QueryPlusPlus Results</Value>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    const searchResponse =
      await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        searchSoap,
        "Retrieve",
      );
    const folder = searchResponse.Body?.RetrieveResponseMsg?.Results;
    if (!folder) return;

    const folderId = Array.isArray(folder) ? folder[0].ID : folder.ID;

    // 2. Retrieve QueryDefinitions in that folder older than 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const querySoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>CustomerKey</Properties>
            <Properties>Name</Properties>
            <Filter xsi:type="ComplexFilterPart">
               <LeftFilter xsi:type="SimpleFilterPart">
                  <Property>CategoryID</Property>
                  <SimpleOperator>equals</SimpleOperator>
                  <Value>${folderId}</Value>
               </LeftFilter>
               <LogicalOperator>AND</LogicalOperator>
               <RightFilter xsi:type="SimpleFilterPart">
                  <Property>CreatedDate</Property>
                  <SimpleOperator>lessThan</SimpleOperator>
                  <Value>${yesterday}</Value>
               </RightFilter>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

    // NOTE: ComplexFilterPart structure above might need XML correction if it's too nested or wrong namespaces.
    // For now I'll assume standard PartnerAPI.

    const queriesResponse =
      await this.mceBridge.soapRequest<SoapRetrieveResponse>(
        tenantId,
        userId,
        mid,
        querySoap,
        "Retrieve",
      );
    const queries = queriesResponse.Body?.RetrieveResponseMsg?.Results;

    if (queries && Array.isArray(queries)) {
      for (const q of queries) {
        if (!q.CustomerKey) continue;
        await this.deleteAsset(
          tenantId,
          userId,
          mid,
          "QueryDefinition",
          q.CustomerKey,
        );
        // Delete associated DE
        // QueryDefinition key: QPP_Query_{runId}
        // DE name: QPP_Results_{hash} where hash = first 4 chars of runId
        const runId = q.CustomerKey.replace("QPP_Query_", "");
        const hash = runId.substring(0, 4);
        await this.deleteAsset(
          tenantId,
          userId,
          mid,
          "DataExtension",
          `QPP_Results_${hash}`,
        );
      }
    }
  }

  private async deleteAsset(
    tenantId: string,
    userId: string,
    mid: string,
    type: string,
    key: string,
  ) {
    const soap = `
      <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="${type}">
            <CustomerKey>${key}</CustomerKey>
         </Objects>
      </DeleteRequest>`;

    try {
      await this.mceBridge.soapRequest(tenantId, userId, mid, soap, "Delete");
      this.logger.log(`Deleted ${type}: ${key}`);
    } catch {
      // Ignore failures during sweep
    }
  }
}
