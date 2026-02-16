import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import type { TenantFeaturesResponse } from '@qpp/shared-types';
import { SubscriptionTierSchema } from '@qpp/shared-types';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FeaturesService } from './features.service';

const UpdateTierBodySchema = z.object({ tier: SubscriptionTierSchema });

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
    @Body(new ZodValidationPipe(UpdateTierBodySchema))
    body: z.infer<typeof UpdateTierBodySchema>,
  ): Promise<TenantFeaturesResponse> {
    return this.featuresService.updateTier(user.tenantId, body.tier);
  }
}
