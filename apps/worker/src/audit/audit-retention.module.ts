import { Module } from "@nestjs/common";

import { AuditRetentionSweeper } from "./audit-retention.sweeper";

@Module({
  providers: [AuditRetentionSweeper],
})
export class AuditRetentionModule {}
