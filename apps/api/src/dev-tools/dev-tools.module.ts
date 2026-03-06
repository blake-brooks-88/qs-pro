import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { BillingModule } from '../billing/billing.module';
import { createContextAwareOrgSubscriptionRepository } from '../billing/context-aware-org-subscription.repository';
import { StripeProvider } from '../billing/stripe.provider';
import { FeaturesModule } from '../features/features.module';
import { DevToolsController } from './dev-tools.controller';
import { DevToolsService } from './dev-tools.service';

@Module({
  imports: [DatabaseModule, FeaturesModule, BillingModule],
  controllers: [DevToolsController],
  providers: [
    StripeProvider,
    DevToolsService,
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: PostgresJsDatabase) =>
        createContextAwareOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
  ],
})
export class DevToolsModule {}
