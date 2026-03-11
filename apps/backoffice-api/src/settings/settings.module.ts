import { Module } from "@nestjs/common";

import { BackofficeAuditService } from "../audit/audit.service.js";
import { SettingsController } from "./settings.controller.js";

@Module({
  controllers: [SettingsController],
  providers: [BackofficeAuditService],
})
export class SettingsModule {}
