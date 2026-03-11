import { Module } from "@nestjs/common";

import { BackofficeAuditService } from "../audit/audit.service.js";
import { TierManagementService } from "../settings/tier-management.service.js";
import { StripeCatalogService } from "../stripe/stripe-catalog.service.js";
import { TenantsController } from "./tenants.controller.js";
import { TenantsService } from "./tenants.service.js";

@Module({
  controllers: [TenantsController],
  providers: [
    TenantsService,
    TierManagementService,
    { provide: "BackofficeAuditService", useClass: BackofficeAuditService },
    { provide: "StripeCatalogService", useClass: StripeCatalogService },
  ],
  exports: [TenantsService, TierManagementService],
})
export class TenantsModule {}
