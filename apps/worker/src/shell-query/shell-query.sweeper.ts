import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MceBridgeService, RlsContextService } from "@qs-pro/backend-shared";
import {
  and,
  credentials,
  eq,
  isNotNull,
  tenantSettings,
} from "@qs-pro/database";

import { SoapRetrieveResponse } from "./shell-query.types";

@Injectable()
export class ShellQuerySweeper {
  private readonly logger = new Logger(ShellQuerySweeper.name);

  constructor(
    private readonly mceBridge: MceBridgeService,
    private readonly rlsContext: RlsContextService,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    @Inject("DATABASE") private readonly db: any,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleSweep() {
    this.logger.log("Starting hourly shell query asset sweep...");

    // Query tenantSettings (no RLS) to get tenant/mid pairs that have QPP folders.
    // This is more efficient than iterating all credentials and ensures we only
    // sweep tenants that actually use the QPP feature.
    const activeSettings = await this.db
      .select({
        tenantId: tenantSettings.tenantId,
        mid: tenantSettings.mid,
      })
      .from(tenantSettings)
      .where(isNotNull(tenantSettings.qppFolderId));

    for (const setting of activeSettings) {
      try {
        await this.sweepTenantMid(setting.tenantId, setting.mid);
      } catch (e: unknown) {
        const err = e as { message?: string };
        this.logger.error(
          `Sweep failed for tenant ${setting.tenantId} MID ${setting.mid}: ${err.message || "Unknown error"}`,
        );
      }
    }

    this.logger.log("Shell query asset sweep completed.");
  }

  /**
   * Sweeps stale assets for a specific tenant/mid combination.
   * Runs within RLS context to properly access credentials.
   */
  private async sweepTenantMid(tenantId: string, mid: string): Promise<void> {
    // Run within RLS context to access credentials securely
    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      // Get a valid userId from credentials for this tenant/mid
      const creds = await this.db
        .select({ userId: credentials.userId })
        .from(credentials)
        .where(
          and(eq(credentials.tenantId, tenantId), eq(credentials.mid, mid)),
        )
        .limit(1);

      if (!creds.length || !creds[0].userId) {
        this.logger.debug(
          `No credentials found for tenant ${tenantId} MID ${mid}, skipping sweep`,
        );
        return;
      }

      const userId = creds[0].userId;
      await this.performSweep(tenantId, userId, mid);
    });
  }

  /**
   * Performs the actual sweep operations for a tenant/mid.
   * Must be called within RLS context.
   */
  private async performSweep(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<void> {
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
    const results = searchResponse.Body?.RetrieveResponseMsg?.Results;
    if (!results) {
      return;
    }

    const folder = Array.isArray(results) ? results[0] : results;
    if (!folder?.ID) {
      return;
    }

    const folderId = folder.ID;

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const querySoap = `
      <RetrieveRequestMsg xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <RetrieveRequest>
            <ObjectType>QueryDefinition</ObjectType>
            <Properties>CustomerKey</Properties>
            <Properties>Name</Properties>
            <Filter xsi:type="ComplexFilterPart">
               <LeftOperand xsi:type="SimpleFilterPart">
                  <Property>CategoryID</Property>
                  <SimpleOperator>equals</SimpleOperator>
                  <Value>${folderId}</Value>
               </LeftOperand>
               <LogicalOperator>AND</LogicalOperator>
               <RightOperand xsi:type="SimpleFilterPart">
                  <Property>CreatedDate</Property>
                  <SimpleOperator>lessThan</SimpleOperator>
                  <Value>${yesterday}</Value>
               </RightOperand>
            </Filter>
         </RetrieveRequest>
      </RetrieveRequestMsg>`;

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
        if (!q.CustomerKey) {
          continue;
        }
        await this.deleteQueryDefinition(tenantId, userId, mid, q.CustomerKey);
      }
    }
  }

  private async deleteQueryDefinition(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<void> {
    const soap = `
      <DeleteRequest xmlns="http://exacttarget.com/wsdl/partnerAPI">
         <Objects xsi:type="QueryDefinition">
            <CustomerKey>${customerKey}</CustomerKey>
         </Objects>
      </DeleteRequest>`;

    try {
      await this.mceBridge.soapRequest(tenantId, userId, mid, soap, "Delete");
      this.logger.log(`Deleted QueryDefinition: ${customerKey}`);
    } catch {
      // Ignore failures during sweep - asset may already be deleted
    }
  }
}
