import { Controller, Get, Query, UseGuards, UseFilters } from '@nestjs/common';
import { MetadataService } from './metadata.service';
import { SessionGuard } from '../auth/session.guard';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { UserSession } from '../common/decorators/current-user.decorator';

@Controller('metadata')
@UseGuards(SessionGuard)
@UseFilters(GlobalExceptionFilter)
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('folders')
  async getFolders(@CurrentUser() user: UserSession) {
    return this.metadataService.getFolders(user.tenantId, user.userId);
  }

  @Get('data-extensions')
  async getDataExtensions(
    @CurrentUser() user: UserSession,
    @Query('eid') eid: string,
  ) {
    return this.metadataService.getDataExtensions(
      user.tenantId,
      user.userId,
      eid,
    );
  }

  @Get('fields')
  async getFields(@CurrentUser() user: UserSession, @Query('key') key: string) {
    return this.metadataService.getFields(user.tenantId, user.userId, key);
  }
}
