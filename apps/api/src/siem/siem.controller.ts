import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import { z } from 'zod';

import { RequireRole } from '../admin/require-role.decorator';
import { RolesGuard } from '../admin/roles.guard';
import { Audited } from '../common/decorators/audited.decorator';
import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FeaturesService } from '../features/features.service';
import { SiemService } from './siem.service';

const UpsertSiemConfigSchema = z.object({
  webhookUrl: z.string().url().startsWith('https://'),
  secret: z.string().min(16).max(512),
});

type UpsertSiemConfigDto = z.infer<typeof UpsertSiemConfigSchema>;

@Controller('admin/siem')
@UseGuards(SessionGuard, RolesGuard)
@RequireRole('owner', 'admin')
export class SiemController {
  constructor(
    private readonly siemService: SiemService,
    private readonly featuresService: FeaturesService,
  ) {}

  private async assertEnterpriseTier(tenantId: string): Promise<void> {
    const { features } = await this.featuresService.getTenantFeatures(tenantId);
    if (!features.auditLogs) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'siemConfig',
        reason: 'SIEM integration requires Enterprise subscription',
      });
    }
  }

  @Get('config')
  async getConfig(@CurrentUser() user: UserSession) {
    await this.assertEnterpriseTier(user.tenantId);
    return this.siemService.getConfig(user.tenantId, user.mid);
  }

  @Put('config')
  @Audited('siem.config_updated')
  async upsertConfig(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(UpsertSiemConfigSchema))
    body: UpsertSiemConfigDto,
  ) {
    await this.assertEnterpriseTier(user.tenantId);
    return this.siemService.upsertConfig(user.tenantId, user.mid, body);
  }

  @Delete('config')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audited('siem.config_deleted')
  async deleteConfig(@CurrentUser() user: UserSession) {
    await this.assertEnterpriseTier(user.tenantId);
    await this.siemService.deleteConfig(user.tenantId, user.mid);
  }

  @Post('test')
  async testWebhook(@CurrentUser() user: UserSession) {
    await this.assertEnterpriseTier(user.tenantId);
    return this.siemService.testWebhook(user.tenantId, user.mid);
  }
}
