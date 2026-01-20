import { Module } from '@nestjs/common';
import { MceModule as SharedMceModule } from '@qpp/backend-shared';

import { AuthModule } from '../auth/auth.module';
import { MceBridgeService } from './mce-bridge.service';
import { MetadataController } from './metadata.controller';

@Module({
  imports: [AuthModule, SharedMceModule],
  controllers: [MetadataController],
  providers: [MceBridgeService],
  exports: [MceBridgeService],
})
export class MceModule {}
