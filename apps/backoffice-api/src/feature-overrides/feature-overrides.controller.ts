import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { FeatureOverridesService } from './feature-overrides.service.js';

@Controller('tenants/:tenantId/feature-overrides')
export class FeatureOverridesController {
  constructor(private readonly overridesService: FeatureOverridesService) {}

  @Get()
  @Roles('admin')
  async listOverrides(@Param('tenantId') tenantId: string) {
    return this.overridesService.getOverridesForTenant(tenantId);
  }

  @Put(':featureKey')
  @Roles('admin')
  async setOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @Body() body: { enabled: boolean },
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await this.overridesService.setOverride(
      tenantId,
      featureKey,
      body.enabled,
      user.id,
      req.ip,
    );
    return { success: true };
  }

  @Delete(':featureKey')
  @Roles('admin')
  async removeOverride(
    @Param('tenantId') tenantId: string,
    @Param('featureKey') featureKey: string,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await this.overridesService.removeOverride(
      tenantId,
      featureKey,
      user.id,
      req.ip,
    );
    return { success: true };
  }
}
