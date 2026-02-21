import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import {
  DrizzleOrgSubscriptionRepository,
  DrizzleStripeWebhookEventRepository,
  DrizzleTenantRepository,
} from '@qpp/database';

import { AuditModule } from '../audit/audit.module';
import { BillingController } from './billing.controller';
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
      useFactory: (db: any) => new DrizzleOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'STRIPE_WEBHOOK_EVENT_REPOSITORY',
      useFactory: (db: any) => new DrizzleStripeWebhookEventRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: any) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
  ],
})
export class BillingModule {}
