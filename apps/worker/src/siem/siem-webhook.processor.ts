import { createHmac } from "node:crypto";

import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import { EncryptionService, RlsContextService } from "@qpp/backend-shared";
import type { ISiemWebhookConfigRepository } from "@qpp/database";
import axios from "axios";
import type { Job } from "bullmq";

import { SIEM_WEBHOOK_CONFIG_REPOSITORY } from "./siem.constants";

export interface SiemWebhookPayload {
  id: string;
  timestamp: string;
  version: "1.0";
  tenantId: string;
  mid: string;
  event: {
    type: string;
    actorType: "user" | "system";
    actorId: string | null;
    actorEmail: string | null;
    targetId: string | null;
    ipAddress: string | null;
    metadata: Record<string, unknown> | null;
  };
}

export interface SiemWebhookJobData {
  payload: SiemWebhookPayload;
  webhookUrl: string;
  secretEncrypted: string;
  tenantId: string;
}

const AUTO_DISABLE_THRESHOLD = 10;

@Processor("siem-webhook", {
  concurrency: 5,
})
export class SiemWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(SiemWebhookProcessor.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    @Inject(SIEM_WEBHOOK_CONFIG_REPOSITORY)
    private readonly siemRepo: ISiemWebhookConfigRepository,
    private readonly rlsContext: RlsContextService,
  ) {
    super();
  }

  async process(job: Job<SiemWebhookJobData>): Promise<void> {
    const { payload, webhookUrl, secretEncrypted, tenantId } = job.data;

    const secret = this.encryptionService.decrypt(secretEncrypted);
    if (!secret) {
      this.logger.error(
        `Failed to decrypt SIEM webhook secret for tenant ${tenantId}`,
      );
      throw new Error("Failed to decrypt webhook secret");
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureBase = `${timestamp}.${body}`;
    const signature = createHmac("sha256", secret)
      .update(signatureBase)
      .digest("hex");

    try {
      await axios.post(webhookUrl, body, {
        headers: {
          "Content-Type": "application/json",
          "X-QPP-Signature": `sha256=${signature}`,
          "X-QPP-Timestamp": String(timestamp),
          "X-QPP-Event-ID": payload.id,
        },
        timeout: 10_000,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      await this.rlsContext.runWithTenantContext(tenantId, "", async () => {
        await this.siemRepo.resetFailures(tenantId);
      });

      this.logger.debug(
        `SIEM webhook delivered for tenant ${tenantId}, event ${payload.event.type}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      this.logger.warn(
        `SIEM webhook delivery failed for tenant ${tenantId}: ${errorMessage}`,
      );

      const failureCount = await this.rlsContext.runWithTenantContext(
        tenantId,
        "",
        async () => {
          return this.siemRepo.incrementFailures(tenantId, errorMessage);
        },
      );

      if (failureCount >= AUTO_DISABLE_THRESHOLD) {
        await this.rlsContext.runWithTenantContext(tenantId, "", async () => {
          await this.siemRepo.disable(
            tenantId,
            `${AUTO_DISABLE_THRESHOLD} consecutive delivery failures`,
          );
        });
        this.logger.warn(
          `SIEM webhook auto-disabled for tenant ${tenantId} after ${AUTO_DISABLE_THRESHOLD} consecutive failures`,
        );
      }

      throw new Error(`Webhook delivery failed: ${errorMessage}`);
    }
  }
}
