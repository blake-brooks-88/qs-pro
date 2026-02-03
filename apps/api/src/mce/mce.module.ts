import { Module } from '@nestjs/common';
import { MceModule as SharedMceModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { MetadataController } from './metadata.controller';

@Module({
  imports: [SharedMceModule],
  controllers: [MetadataController],
  providers: [CsrfGuard],
  exports: [SharedMceModule],
})
export class MceModule {}
