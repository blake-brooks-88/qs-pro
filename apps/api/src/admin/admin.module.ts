import { Module } from '@nestjs/common';
import { DrizzleUserRepository } from '@qpp/database';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { RolesGuard } from './roles.guard';

@Module({
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
