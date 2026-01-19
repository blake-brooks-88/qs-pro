import { Module } from '@nestjs/common';
import { AuthModule as BackendSharedAuthModule } from '@qs-pro/backend-shared';

import { AuthController } from './auth.controller';

@Module({
  imports: [BackendSharedAuthModule],
  controllers: [AuthController],
  exports: [BackendSharedAuthModule],
})
export class AuthModule {}
