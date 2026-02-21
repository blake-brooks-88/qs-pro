import { Module } from '@nestjs/common';
import { AuthModule as BackendSharedAuthModule } from '@qpp/backend-shared';

import { TrialModule } from '../trial/trial.module';
import { AuthController } from './auth.controller';

@Module({
  imports: [BackendSharedAuthModule, TrialModule],
  controllers: [AuthController],
  exports: [BackendSharedAuthModule],
})
export class AuthModule {}
