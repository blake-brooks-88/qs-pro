import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import type {
  CreateQueryActivityDto,
  LinkQueryRequest,
  PublishQueryRequest,
} from '@qpp/shared-types';
import {
  CreateQueryActivitySchema,
  LinkQueryRequestSchema,
  PublishQueryRequestSchema,
  UnlinkRequestSchema,
} from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import { Audited } from '../common/decorators/audited.decorator';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FeaturesService } from '../features/features.service';
import { QueryActivitiesService } from './query-activities.service';

@Controller('query-activities')
@UseGuards(SessionGuard)
@UseFilters(GlobalExceptionFilter)
export class QueryActivitiesController {
  constructor(
    private readonly queryActivitiesService: QueryActivitiesService,
    private readonly featuresService: FeaturesService,
  ) {}

  private async requireDeployFeature(tenantId: string): Promise<void> {
    const { features } = await this.featuresService.getTenantFeatures(tenantId);
    if (!features.deployToAutomation) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'queryActivities',
        reason: 'Deploy to Automation requires Pro subscription',
      });
    }
  }

  @Post()
  @UseGuards(CsrfGuard)
  @Audited('query_activity.created')
  async create(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(CreateQueryActivitySchema))
    dto: CreateQueryActivityDto,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.create(
      user.tenantId,
      user.userId,
      user.mid,
      dto,
    );
  }

  @Get()
  async findAll(@CurrentUser() user: UserSession) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.listAllWithLinkStatus(
      user.tenantId,
      user.userId,
      user.mid,
    );
  }

  @Post('link/:savedQueryId')
  @UseGuards(CsrfGuard)
  @Audited('query_activity.linked', { targetIdParam: 'savedQueryId' })
  async linkQuery(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
    @Body(new ZodValidationPipe(LinkQueryRequestSchema))
    dto: LinkQueryRequest,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.linkQuery(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
      dto.qaCustomerKey,
      dto.conflictResolution,
    );
  }

  @Delete('link/:savedQueryId')
  @UseGuards(CsrfGuard)
  @Audited('query_activity.unlinked', { targetIdParam: 'savedQueryId' })
  async unlinkQuery(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
    @Body() body: unknown,
  ) {
    await this.requireDeployFeature(user.tenantId);

    const parsed = UnlinkRequestSchema.safeParse(body ?? {});
    const options = parsed.success
      ? parsed.data
      : { deleteLocal: false, deleteRemote: false };

    return this.queryActivitiesService.unlinkQuery(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
      options,
    );
  }

  @Post('publish/:savedQueryId')
  @UseGuards(CsrfGuard)
  @Audited('query_activity.published', { targetIdParam: 'savedQueryId' })
  async publishQuery(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
    @Body(new ZodValidationPipe(PublishQueryRequestSchema))
    dto: PublishQueryRequest,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.publish(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
      dto.versionId,
    );
  }

  @Get('drift/:savedQueryId')
  async checkDrift(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.checkDrift(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
    );
  }

  @Get('blast-radius/:savedQueryId')
  async getBlastRadius(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId', new ParseUUIDPipe({ version: '4' }))
    savedQueryId: string,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.getBlastRadius(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
    );
  }

  @Get(':customerKey')
  async findOne(
    @CurrentUser() user: UserSession,
    @Param('customerKey') customerKey: string,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.getDetail(
      user.tenantId,
      user.userId,
      user.mid,
      customerKey,
    );
  }
}
