import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';
import { DrizzleTenantRepository } from '@qpp/database';

import { createContextAwareOrgSubscriptionRepository } from '../billing/context-aware-org-subscription.repository';
import { StripeProvider } from '../billing/stripe.provider';
import { FeaturesModule } from '../features/features.module';
import { DevToolsController } from './dev-tools.controller';
import { DevToolsService } from './dev-tools.service';

@Module({
  imports: [DatabaseModule, FeaturesModule],
  controllers: [DevToolsController],
  providers: [
    StripeProvider,
    DevToolsService,
    {
      provide: 'ORG_SUBSCRIPTION_REPOSITORY',
      useFactory: (db: any) => createContextAwareOrgSubscriptionRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: any) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
  ],
})
export class DevToolsModule {}
