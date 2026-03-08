import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';

import { BackofficeAuditService } from '../audit/audit.service.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { TierManagementService } from '../settings/tier-management.service.js';
import { BackofficeThrottlerGuard } from './backoffice-throttler.guard.js';
import { TenantsService } from './tenants.service.js';
import { TenantListQuerySchema } from './tenants.types.js';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly auditService: BackofficeAuditService,
    private readonly tierManagement: TierManagementService,
  ) {}

  @Get()
  @Roles('viewer')
  async findAll(@Query() query: Record<string, unknown>) {
    const parsed = TenantListQuerySchema.parse(query);
    return this.tenantsService.findAll(parsed);
  }

  @Get('lookup/:eid')
  @Roles('viewer')
  @UseGuards(BackofficeThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async lookupByEid(
    @Param('eid') eid: string,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    void this.auditService.log({
      backofficeUserId: user.id,
      eventType: 'tenant.eid_lookup',
      metadata: { eid },
      ipAddress: req.ip,
    });

    const result = await this.tenantsService.lookupByEid(eid);
    if (!result) {
      throw new NotFoundException('Tenant not found');
    }
    return result;
  }

  @Get(':id')
  @Roles('viewer')
  async findById(@Param('id') id: string) {
    const result = await this.tenantsService.findById(id);
    if (!result) {
      throw new NotFoundException('Tenant not found');
    }
    return result;
  }

  @Patch(':id/tier')
  @Roles('admin')
  async changeTier(
    @Param('id') id: string,
    @Body() body: { tier: 'pro' | 'enterprise'; interval: 'monthly' | 'annual' },
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await this.tierManagement.changeTier(
      id,
      body.tier,
      body.interval,
      user.id,
      req.ip,
    );
    return { success: true };
  }

  @Post(':id/cancel')
  @Roles('admin')
  async cancelSubscription(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Req() req: FastifyRequest,
  ) {
    await this.tierManagement.cancelSubscription(id, user.id, req.ip);
    return { success: true };
  }
}
