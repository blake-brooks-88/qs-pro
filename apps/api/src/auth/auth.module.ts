import { Module } from '@nestjs/common';
import { AuthModule as BackendSharedAuthModule } from '@qpp/backend-shared';
import { DrizzleUserRepository } from '@qpp/database';

import { TrialModule } from '../trial/trial.module';
import { AuthController } from './auth.controller';
import { LastActiveService } from './last-active.service';

@Module({
  imports: [BackendSharedAuthModule, TrialModule],
  controllers: [AuthController],
  providers: [
    LastActiveService,
    {
      provide: 'USER_REPOSITORY',
      useFactory: (db: unknown) => new DrizzleUserRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [BackendSharedAuthModule],
})
export class AuthModule {}
