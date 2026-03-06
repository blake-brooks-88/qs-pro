import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import {
  DrizzleStripeBillingBindingRepository,
  DrizzleStripeCheckoutSessionRepository,
  DrizzleStripeWebhookEventRepository,
  DrizzleTenantRepository,
} from '@qpp/database';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { AuditModule } from '../audit/audit.module';
import { BillingController } from './billing.controller';
import { BILLING_WEBHOOK_QUEUE } from './billing.queue';
import { BillingService } from './billing.service';
import { BillingWebhookProcessor } from './billing-webhook.processor';
import { createContextAwareOrgSubscriptionRepository } from './context-aware-org-subscription.repository';
import { StripeProvider } from './stripe.provider';
import { WebhookHandlerService } from './webhook-handler.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: BILLING_WEBHOOK_QUEUE,
    }),
    DatabaseModule,
    AuditModule,
  ],
  controllers: [BillingController],
  providers: [
    StripeProvider,
    WebhookHandlerService,
    BillingWebhookProcessor,
    BillingService,
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) =>
        createContextAwareOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'STRIPE_BILLING_BINDING_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) =>
        new DrizzleStripeBillingBindingRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'STRIPE_CHECKOUT_SESSION_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) =>
        new DrizzleStripeCheckoutSessionRepository(db),
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
  exports: [BillingService, WebhookHandlerService],
})
export class BillingModule {}
