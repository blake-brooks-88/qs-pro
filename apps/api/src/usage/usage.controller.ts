import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';
import type { UsageResponse } from '@qpp/shared-types';

import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsageService } from './usage.service';

@Controller('usage')
@UseGuards(SessionGuard)
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  async getUsage(@CurrentUser() user: UserSession): Promise<UsageResponse> {
    return this.usageService.getUsage(user.tenantId, user.mid, user.userId);
  }
}
