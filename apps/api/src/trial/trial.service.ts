import { Inject, Injectable, Logger } from '@nestjs/common';
import { RlsContextService } from '@qpp/backend-shared';
import type { IOrgSubscriptionRepository } from '@qpp/database';
import type { TrialState } from '@qpp/shared-types';

import { AuditService } from '../audit/audit.service';

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    @Inject('ORG_SUBSCRIPTION_REPOSITORY')
    private orgSubscriptionRepo: IOrgSubscriptionRepository,
    private readonly auditService: AuditService,
    private readonly rlsContext: RlsContextService,
  ) {}

  async activateTrial(
    tenantId: string,
    auditContext: { actorId: string; mid: string },
  ): Promise<void> {
    const trialEndsAt = new Date(Date.now() + TRIAL_DURATION_MS);

    const activated = await this.rlsContext.runWithTenantContext(
      tenantId,
      auditContext.mid,
      async () => {
        const inserted = await this.orgSubscriptionRepo.insertIfNotExists({
          tenantId,
          tier: 'pro',
          trialEndsAt,
          seatLimit: null,
        });
        if (inserted) {
          return true;
        }
        return this.orgSubscriptionRepo.startTrialIfEligible(
          tenantId,
          trialEndsAt,
        );
      },
    );

    if (activated) {
      this.logger.log(`Trial activated for tenant=${tenantId}`);
      void this.auditService.log({
        eventType: 'subscription.trial_activated',
        actorType: 'user',
        actorId: auditContext.actorId,
        tenantId,
        mid: auditContext.mid,
        targetId: tenantId,
      });
    }
  }

  async getTrialState(tenantId: string): Promise<TrialState | null> {
    const subscription =
      await this.orgSubscriptionRepo.findByTenantId(tenantId);

    if (!subscription) {
      return null;
    }

    if (!subscription.trialEndsAt) {
      return null;
    }

    const now = Date.now();
    const endsAtMs = subscription.trialEndsAt.getTime();

    if (endsAtMs > now) {
      return {
        active: true,
        daysRemaining: Math.ceil((endsAtMs - now) / (24 * 60 * 60 * 1000)),
        endsAt: subscription.trialEndsAt.toISOString(),
      };
    }

    return {
      active: false,
      daysRemaining: 0,
      endsAt: subscription.trialEndsAt.toISOString(),
    };
  }
}
