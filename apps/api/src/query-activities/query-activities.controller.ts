import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import { CreateQueryActivitySchema } from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { FeaturesService } from '../features/features.service';
import { QueryActivitiesService } from './query-activities.service';

@Controller('query-activities')
@UseGuards(SessionGuard, CsrfGuard)
@UseFilters(GlobalExceptionFilter)
export class QueryActivitiesController {
  constructor(
    private readonly queryActivitiesService: QueryActivitiesService,
    private readonly featuresService: FeaturesService,
  ) {}

  @Post()
  async create(@CurrentUser() user: UserSession, @Body() body: unknown) {
    const { features } = await this.featuresService.getTenantFeatures(
      user.tenantId,
    );
    if (!features.deployToAutomation) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'createQueryActivity',
        reason: 'Deploy to Automation requires Pro subscription',
      });
    }

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
}
