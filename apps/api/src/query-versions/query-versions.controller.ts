import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import { UpdateVersionNameSchema } from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { QueryVersionsService } from './query-versions.service';

@Controller('saved-queries')
@UseGuards(SessionGuard)
export class QueryVersionsController {
  constructor(private readonly queryVersionsService: QueryVersionsService) {}

  @Get(':savedQueryId/versions')
  async listVersions(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
  ) {
    return this.queryVersionsService.listVersions(
      user.tenantId,
      user.mid,
      user.userId,
      savedQueryId,
    );
  }

  @Get(':savedQueryId/versions/publish-events')
  async listPublishEvents(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
  ) {
    return this.queryVersionsService.listPublishEvents(
      user.tenantId,
      user.mid,
      user.userId,
      savedQueryId,
    );
  }

  @Get(':savedQueryId/versions/:versionId')
  async getVersionDetail(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.queryVersionsService.getVersionDetail(
      user.tenantId,
      user.mid,
      user.userId,
      savedQueryId,
      versionId,
    );
  }

  @Post(':savedQueryId/versions/:versionId/restore')
  @UseGuards(CsrfGuard)
  @Audited('version.restored', { targetIdParam: 'versionId' })
  async restore(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.queryVersionsService.restore(
      user.tenantId,
      user.mid,
      user.userId,
      savedQueryId,
      versionId,
    );
  }

  @Patch(':savedQueryId/versions/:versionId')
  @UseGuards(CsrfGuard)
  @Audited('version.renamed', { targetIdParam: 'versionId' })
  async updateName(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
  ) {
    const result = UpdateVersionNameSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }
    return this.queryVersionsService.updateName(
      user.tenantId,
      user.mid,
      user.userId,
      savedQueryId,
      versionId,
      result.data,
    );
  }
}
