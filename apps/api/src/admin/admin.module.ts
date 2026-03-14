import { Module } from '@nestjs/common';
import { DrizzleUserRepository } from '@qpp/database';

import { GdprModule } from '../gdpr/gdpr.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [GdprModule],
  controllers: [AdminController],
  providers: [
    AdminService,
    RolesGuard,
    {
      provide: 'USER_REPOSITORY',
      useFactory: (db: unknown) => new DrizzleUserRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [AdminService, RolesGuard, 'USER_REPOSITORY'],
})
export class AdminModule {}
