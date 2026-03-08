import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from '@qpp/backend-shared';

import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FeatureOverridesModule } from './feature-overrides/feature-overrides.module.js';
import { HealthModule } from './health/health.module.js';
import { InvoicingModule } from './invoicing/invoicing.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { StripeModule } from './stripe/stripe.module.js';
import { TenantsModule } from './tenants/tenants.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [{ ttl: 60000, limit: 30 }],
        storage: new ThrottlerStorageRedisService(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        ),
      }),
    }),
    LoggerModule,
    DatabaseModule,
    AuthModule,
    AuditModule,
    StripeModule,
    FeatureOverridesModule,
    HealthModule,
    InvoicingModule,
    SettingsModule,
    TenantsModule,
  ],
})
export class AppModule {}
