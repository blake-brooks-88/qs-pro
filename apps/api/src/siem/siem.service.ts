import { createHmac } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  EncryptionService,
  ErrorCode,
  RlsContextService,
} from '@qpp/backend-shared';
import type {
  ISiemWebhookConfigRepository,
  SiemWebhookConfig,
} from '@qpp/database';
import axios from 'axios';
import { randomUUID } from 'crypto';

import { SIEM_WEBHOOK_CONFIG_REPOSITORY } from './siem.repository';
import type {
  SiemWebhookConfigResponse,
  SiemWebhookPayload,
} from './siem.types';

function mapConfigToResponse(
  config: SiemWebhookConfig,
): SiemWebhookConfigResponse {
  return {
    id: config.id,
    webhookUrl: config.webhookUrl,
    enabled: config.enabled,
    consecutiveFailures: config.consecutiveFailures,
    lastSuccessAt: config.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: config.lastFailureAt?.toISOString() ?? null,
    lastFailureReason: config.lastFailureReason ?? null,
    disabledAt: config.disabledAt?.toISOString() ?? null,
    disabledReason: config.disabledReason ?? null,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function signPayload(
  body: string,
  secret: string,
): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureBase = `${timestamp}.${body}`;
  const signature = createHmac('sha256', secret)
    .update(signatureBase)
    .digest('hex');
  return { signature, timestamp };
}

@Injectable()
export class SiemService {
  private readonly logger = new Logger(SiemService.name);

  constructor(
    @Inject(SIEM_WEBHOOK_CONFIG_REPOSITORY)
    private readonly siemRepo: ISiemWebhookConfigRepository,
    private readonly rlsContext: RlsContextService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async getConfig(
    tenantId: string,
    mid: string,
  ): Promise<SiemWebhookConfigResponse | null> {
    const config = await this.rlsContext.runWithTenantContext(
      tenantId,
      mid,
      () => this.siemRepo.findByTenantId(tenantId),
    );
    if (!config) {
      return null;
    }
    return mapConfigToResponse(config);
  }

  async upsertConfig(
    tenantId: string,
    mid: string,
    data: { webhookUrl: string; secret: string },
  ): Promise<SiemWebhookConfigResponse> {
    if (!data.webhookUrl.startsWith('https://')) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, undefined, {
        reason: 'Webhook URL must use HTTPS',
      });
    }

    const secretEncrypted = this.encryptionService.encrypt(data.secret);
    if (!secretEncrypted) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        reason: 'Failed to encrypt webhook secret',
      });
    }

    const config = await this.rlsContext.runWithTenantContext(
      tenantId,
      mid,
      () =>
        this.siemRepo.upsert({
          tenantId,
          mid,
          webhookUrl: data.webhookUrl,
          secretEncrypted,
          enabled: true,
        }),
    );

    return mapConfigToResponse(config);
  }

  async deleteConfig(tenantId: string, mid: string): Promise<void> {
    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      const config = await this.siemRepo.findByTenantId(tenantId);
      if (config) {
        await this.siemRepo.disable(tenantId, 'Deleted by admin');
      }
    });
  }

  async testWebhook(
    tenantId: string,
    mid: string,
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const config = await this.rlsContext.runWithTenantContext(
      tenantId,
      mid,
      () => this.siemRepo.findByTenantId(tenantId),
    );

    if (!config) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        reason: 'No SIEM webhook configuration found',
      });
    }

    const secret = this.encryptionService.decrypt(config.secretEncrypted);
    if (!secret) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        reason: 'Failed to decrypt webhook secret',
      });
    }

    const payload: SiemWebhookPayload = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      version: '1.0',
      tenantId,
      mid,
      event: {
        type: 'siem.test',
        actorType: 'system',
        actorId: null,
        actorEmail: null,
        targetId: null,
        ipAddress: null,
        metadata: { test: true },
      },
    };

    const body = JSON.stringify(payload);
    const { signature, timestamp } = signPayload(body, secret);

    try {
      const response = await axios.post(config.webhookUrl, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-QPP-Signature': `sha256=${signature}`,
          'X-QPP-Timestamp': String(timestamp),
          'X-QPP-Event-ID': payload.id,
        },
        timeout: 10_000,
        validateStatus: () => true,
      });

      const success = response.status >= 200 && response.status < 300;
      return { success, statusCode: response.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`SIEM test webhook failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async getConfigForDelivery(
    tenantId: string,
  ): Promise<{ webhookUrl: string; secretEncrypted: string } | null> {
    const config = await this.siemRepo.findByTenantId(tenantId);
    if (!config?.enabled) {
      return null;
    }
    return {
      webhookUrl: config.webhookUrl,
      secretEncrypted: config.secretEncrypted,
    };
  }
}
