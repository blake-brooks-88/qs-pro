import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MceBridgeService, RlsContextService } from "@qs-pro/backend-shared";
import {
  and,
  credentials,
  eq,
  isNotNull,
  type PostgresJsDatabase,
  tenantSettings,
} from "@qs-pro/database";

import { QueryDefinitionService } from "./query-definition.service";
import { SoapRetrieveResponse } from "./shell-query.types";

@Injectable()
export class ShellQuerySweeper {
  private readonly logger = new Logger(ShellQuerySweeper.name);

  constructor(
    private readonly mceBridge: MceBridgeService,
    private readonly rlsContext: RlsContextService,
    private readonly queryDefinitionService: QueryDefinitionService,
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase<Record<string, never>>,
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
        qppFolderId: tenantSettings.qppFolderId,
      })
      .from(tenantSettings)
      .where(isNotNull(tenantSettings.qppFolderId));

    for (const setting of activeSettings) {
      if (!setting.qppFolderId) {
        continue;
      }
      try {
        await this.sweepTenantMid(
          setting.tenantId,
          setting.mid,
          setting.qppFolderId,
        );
      } catch (e: unknown) {
        const err = e as { message?: string };
        this.logger.error(
          `Sweep failed for tenant ${setting.tenantId} MID ${setting.mid}: ${err.message || "Unknown error"}`,
        );
      }
    }

    this.logger.log("Shell query asset sweep completed.");
  }

  private async sweepTenantMid(
    tenantId: string,
    mid: string,
    folderId: number,
  ): Promise<void> {
    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      const creds = await this.db
        .select({ userId: credentials.userId })
        .from(credentials)
        .where(
          and(eq(credentials.tenantId, tenantId), eq(credentials.mid, mid)),
        )
        .limit(1);

      const firstCred = creds[0];

      if (!firstCred?.userId) {
        this.logger.debug(
          `No credentials found for tenant ${tenantId} MID ${mid}, skipping sweep`,
        );
        return;
      }

      await this.performSweep(tenantId, firstCred.userId, mid, folderId);
    });
  }

  private async performSweep(
    tenantId: string,
    userId: string,
    mid: string,
    folderId: number,
  ): Promise<void> {
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
    const results = queriesResponse.Body?.RetrieveResponseMsg?.Results;
    if (!results) {
      return;
    }

    const queries = Array.isArray(results) ? results : [results];
    for (const q of queries) {
      if (!q.CustomerKey) {
        continue;
      }
      await this.deleteQueryDefinition(tenantId, userId, mid, q.CustomerKey);
    }
  }

  private async deleteQueryDefinition(
    tenantId: string,
    userId: string,
    mid: string,
    customerKey: string,
  ): Promise<void> {
    try {
      const deleted = await this.queryDefinitionService.deleteByCustomerKey(
        tenantId,
        userId,
        mid,
        customerKey,
      );
      if (deleted) {
        this.logger.log(`Deleted QueryDefinition: ${customerKey}`);
      }
    } catch {
      // Ignore failures during sweep - asset may already be deleted
    }
  }
}
