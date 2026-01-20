import { Module } from '@nestjs/common';
import { AuthModule as BackendSharedAuthModule } from '@qpp/backend-shared';

import { AuthController } from './auth.controller';

@Module({
  imports: [BackendSharedAuthModule],
  controllers: [AuthController],
  exports: [BackendSharedAuthModule],
})
export class AuthModule {}
