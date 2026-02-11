import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import {
  CreateQueryActivitySchema,
  LinkQueryRequestSchema,
  PublishQueryRequestSchema,
} from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
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
  async create(@CurrentUser() user: UserSession, @Body() body: unknown) {
    await this.requireDeployFeature(user.tenantId);

    const result = CreateQueryActivitySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    return this.queryActivitiesService.create(
      user.tenantId,
      user.userId,
      user.mid,
      result.data,
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
  async linkQuery(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
    @Body() body: unknown,
  ) {
    await this.requireDeployFeature(user.tenantId);

    const result = LinkQueryRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    return this.queryActivitiesService.linkQuery(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
      result.data.qaCustomerKey,
      result.data.conflictResolution,
    );
  }

  @Delete('link/:savedQueryId')
  @UseGuards(CsrfGuard)
  async unlinkQuery(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
  ) {
    await this.requireDeployFeature(user.tenantId);

    return this.queryActivitiesService.unlinkQuery(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
    );
  }

  @Post('publish/:savedQueryId')
  @UseGuards(CsrfGuard)
  async publishQuery(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
    @Body() body: unknown,
  ) {
    await this.requireDeployFeature(user.tenantId);

    const result = PublishQueryRequestSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    return this.queryActivitiesService.publish(
      user.tenantId,
      user.userId,
      user.mid,
      savedQueryId,
      result.data.versionId,
    );
  }

  @Get('drift/:savedQueryId')
  async checkDrift(
    @CurrentUser() user: UserSession,
    @Param('savedQueryId') savedQueryId: string,
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
    @Param('savedQueryId') savedQueryId: string,
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
