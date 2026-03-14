import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '@qpp/backend-shared';

import { RequireRole } from '../admin/require-role.decorator';
import { RolesGuard } from '../admin/roles.guard';
import { Audited } from '../common/decorators/audited.decorator';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { DataExportService } from './data-export.service';

@Controller('admin')
@UseGuards(SessionGuard, RolesGuard)
export class GdprController {
  constructor(private readonly dataExportService: DataExportService) {}

  @Get('members/:id/export')
  @RequireRole('owner', 'admin')
  @Audited('gdpr.data_exported', { targetIdParam: 'id' })
  async exportUserData(
    @CurrentUser() user: UserSession,
    @Param('id', new ParseUUIDPipe({ version: '4' })) targetUserId: string,
  ) {
    return this.dataExportService.exportUserData(
      user.tenantId,
      user.mid,
      targetUserId,
    );
  }
}
