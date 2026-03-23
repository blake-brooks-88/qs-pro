import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { MceModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { RelationshipsController } from './relationships.controller';
import { RelationshipsService } from './relationships.service';

@Module({
  imports: [MceModule, CacheModule.register()],
  controllers: [RelationshipsController],
  providers: [RelationshipsService, CsrfGuard],
})
export class RelationshipsModule {}
