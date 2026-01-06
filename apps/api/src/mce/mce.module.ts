import { Module } from '@nestjs/common';
import { MceBridgeService } from './mce-bridge.service';
import { MetadataService } from './metadata.service';
import { AuthModule } from '../auth/auth.module';
import { CacheModule } from '@nestjs/cache-manager';
import { MetadataController } from './metadata.controller';

@Module({
  imports: [AuthModule, CacheModule.register()],
  controllers: [MetadataController],
  providers: [MceBridgeService, MetadataService],
  exports: [MceBridgeService, MetadataService],
})
export class MceModule {}
