import { Module } from '@nestjs/common';
import { MceModule as SharedMceModule } from '@qpp/backend-shared';

import { AuthModule } from '../auth/auth.module';
import { MetadataController } from './metadata.controller';

@Module({
  imports: [AuthModule, SharedMceModule],
  controllers: [MetadataController],
  exports: [SharedMceModule],
})
export class MceModule {}
