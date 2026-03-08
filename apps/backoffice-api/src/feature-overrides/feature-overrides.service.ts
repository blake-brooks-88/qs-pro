import {
  BadRequestException,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  tenantFeatureOverrides,
  eq,
  and,
} from '@qpp/database';
import type { PostgresJsDatabase } from '@qpp/database';
import { FeatureKeySchema } from '@qpp/shared-types';

import { DRIZZLE_DB } from '../database/database.module.js';
import { BackofficeAuditService } from '../audit/audit.service.js';

@Injectable()
export class FeatureOverridesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: PostgresJsDatabase,
    @Inject('BackofficeAuditService')
    private readonly auditService: BackofficeAuditService,
  ) {}

  async getOverridesForTenant(
    tenantId: string,
  ): Promise<{ featureKey: string; enabled: boolean }[]> {
    return this.db
      .select({
        featureKey: tenantFeatureOverrides.featureKey,
        enabled: tenantFeatureOverrides.enabled,
      })
      .from(tenantFeatureOverrides)
      .where(eq(tenantFeatureOverrides.tenantId, tenantId));
  }

  async setOverride(
    tenantId: string,
    featureKey: string,
    enabled: boolean,
    backofficeUserId: string,
    ip: string,
  ): Promise<void> {
    this.validateFeatureKey(featureKey);

    await this.db
      .insert(tenantFeatureOverrides)
      .values({ tenantId, featureKey, enabled })
      .onConflictDoUpdate({
        target: [
          tenantFeatureOverrides.tenantId,
          tenantFeatureOverrides.featureKey,
        ],
        set: { enabled },
      });

    void this.auditService.log({
      backofficeUserId,
      targetTenantId: tenantId,
      eventType: 'backoffice.feature_override_changed',
      metadata: { featureKey, enabled },
      ipAddress: ip,
    });
  }

  async removeOverride(
    tenantId: string,
    featureKey: string,
    backofficeUserId: string,
    ip: string,
  ): Promise<void> {
    await this.db
      .delete(tenantFeatureOverrides)
      .where(
        and(
          eq(tenantFeatureOverrides.tenantId, tenantId),
          eq(tenantFeatureOverrides.featureKey, featureKey),
        ),
      );

    void this.auditService.log({
      backofficeUserId,
      targetTenantId: tenantId,
      eventType: 'backoffice.feature_override_removed',
      metadata: { featureKey },
      ipAddress: ip,
    });
  }

  private validateFeatureKey(key: string): void {
    const result = FeatureKeySchema.safeParse(key);
    if (!result.success) {
      throw new BadRequestException(
        `Invalid feature key: "${key}". Must be one of: ${FeatureKeySchema.options.join(', ')}`,
      );
    }
  }
}
