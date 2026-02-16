import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import type { UpdateVersionNameDto } from '@qpp/shared-types';
import { UpdateVersionNameSchema } from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { QueryVersionsService } from './query-versions.service';

@Controller('saved-queries')
@UseGuards(SessionGuard)
export class QueryVersionsController {
  constructor(private readonly queryVersionsService: QueryVersionsService) {}

  @Get(':savedQueryId/versions')
  async listVersions(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
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
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
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
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
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
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
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
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
    @Param('versionId', new ParseUUIDPipe({ version: '4' }))
    versionId: string,
    @Body(new ZodValidationPipe(UpdateVersionNameSchema))
    dto: UpdateVersionNameDto,
  ) {
    return this.queryVersionsService.updateName(
      user.tenantId,
      user.mid,
      user.userId,
      savedQueryId,
      versionId,
      dto,
    );
  }
}
