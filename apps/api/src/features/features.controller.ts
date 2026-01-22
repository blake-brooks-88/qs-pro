import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import type { TenantFeatures } from '@qpp/shared-types';

import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeaturesService } from './features.service';

@Controller('features')
@UseGuards(SessionGuard)
export class FeaturesController {
  constructor(private readonly featuresService: FeaturesService) {}

  /**
   * Returns the effective features for the authenticated tenant
   */
  @Get()
  async getFeatures(@CurrentUser() user: UserSession): Promise<TenantFeatures> {
    return this.featuresService.getTenantFeatures(user.tenantId);
  }
}
