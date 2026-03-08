import { getDbFromContext } from '@qpp/backend-shared';
import {
  DrizzleOrgSubscriptionRepository,
  type IOrgSubscriptionRepository,
  type NewOrgSubscription,
  type OrgSubscription,
} from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

class ContextAwareOrgSubscriptionRepository implements IOrgSubscriptionRepository {
  constructor(private readonly defaultDb: PostgresJsDatabase) {}

  private getRepo(): DrizzleOrgSubscriptionRepository {
    const contextDb = getDbFromContext() as PostgresJsDatabase | undefined;
    return new DrizzleOrgSubscriptionRepository(contextDb ?? this.defaultDb);
  }

  findByTenantId(tenantId: string): Promise<OrgSubscription | undefined> {
    return this.getRepo().findByTenantId(tenantId);
  }

  upsert(subscription: NewOrgSubscription): Promise<OrgSubscription> {
    return this.getRepo().upsert(subscription);
  }

  insertIfNotExists(subscription: NewOrgSubscription): Promise<boolean> {
    return this.getRepo().insertIfNotExists(subscription);
  }

  startTrialIfEligible(tenantId: string, trialEndsAt: Date): Promise<boolean> {
    return this.getRepo().startTrialIfEligible(tenantId, trialEndsAt);
  }

  updateTierByTenantId(
    tenantId: string,
    tier: 'free' | 'pro' | 'enterprise',
  ): Promise<void> {
    return this.getRepo().updateTierByTenantId(tenantId, tier);
  }

  updateFromWebhook(
    tenantId: string,
    data: Partial<OrgSubscription>,
  ): Promise<void> {
    return this.getRepo().updateFromWebhook(tenantId, data);
  }
}

export function createContextAwareOrgSubscriptionRepository(
  db: PostgresJsDatabase,
): IOrgSubscriptionRepository {
  return new ContextAwareOrgSubscriptionRepository(db);
}
