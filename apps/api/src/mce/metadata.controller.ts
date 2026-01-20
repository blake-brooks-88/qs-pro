import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { MetadataService } from '@qpp/backend-shared';

import { SessionGuard } from '../auth/session.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';

@Controller('metadata')
@UseGuards(SessionGuard)
@UseFilters(GlobalExceptionFilter)
export class MetadataController {
  constructor(private readonly metadataService: MetadataService) {}

  @Get('folders')
  async getFolders(
    @CurrentUser() user: UserSession,
    @Query('eid') eid?: string,
  ) {
    return this.metadataService.getFolders(
      user.tenantId,
      user.userId,
      user.mid,
      eid,
    );
  }

  @Get('data-extensions')
  async getDataExtensions(
    @CurrentUser() user: UserSession,
    @Query('eid') eid: string,
  ) {
    return this.metadataService.getDataExtensions(
      user.tenantId,
      user.userId,
      user.mid,
      eid,
    );
  }

  @Get('fields')
  async getFields(@CurrentUser() user: UserSession, @Query('key') key: string) {
    return this.metadataService.getFields(
      user.tenantId,
      user.userId,
      user.mid,
      key,
    );
  }
}
