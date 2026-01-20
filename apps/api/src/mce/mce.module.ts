import { Module } from '@nestjs/common';
import { MceModule as SharedMceModule } from '@qpp/backend-shared';

import { MetadataController } from './metadata.controller';

@Module({
  imports: [SharedMceModule],
  controllers: [MetadataController],
  exports: [SharedMceModule],
})
export class MceModule {}
