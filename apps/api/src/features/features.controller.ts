import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import type { TenantFeaturesResponse } from '@qpp/shared-types';

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
}
