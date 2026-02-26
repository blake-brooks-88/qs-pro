import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import {
  DrizzleStripeWebhookEventRepository,
  DrizzleTenantRepository,
} from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { AuditModule } from '../audit/audit.module';
import { BillingController } from './billing.controller';
import { createContextAwareOrgSubscriptionRepository } from './context-aware-org-subscription.repository';
import { StripeProvider } from './stripe.provider';
import { WebhookHandlerService } from './webhook-handler.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [BillingController],
  providers: [
    StripeProvider,
    WebhookHandlerService,
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) =>
        createContextAwareOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'STRIPE_WEBHOOK_EVENT_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) =>
        new DrizzleStripeWebhookEventRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
  ],
})
export class BillingModule {}
