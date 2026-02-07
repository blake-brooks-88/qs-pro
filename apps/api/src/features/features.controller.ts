import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import type { TenantFeaturesResponse } from '@qpp/shared-types';
import { SubscriptionTierSchema } from '@qpp/shared-types';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeaturesService } from './features.service';

@Controller('features')
@UseGuards(SessionGuard)
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  @Get()
  async getFeatures(
    @CurrentUser() user: UserSession,
  ): Promise<TenantFeaturesResponse> {
    return this.featuresService.getTenantFeatures(user.tenantId);
  }

  @Patch('tier')
  @UseGuards(CsrfGuard)
  async updateTier(
    @CurrentUser() user: UserSession,
    @Body() body: unknown,
  ): Promise<TenantFeaturesResponse> {
    const result = SubscriptionTierSchema.safeParse(
      (body as Record<string, unknown>)?.tier,
    );
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }
    return this.featuresService.updateTier(user.tenantId, result.data);
  }
}
