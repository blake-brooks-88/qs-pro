import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import type { AuditLogQueryParams } from '@qpp/shared-types';
import { AuditLogQueryParamsSchema } from '@qpp/shared-types';

import {
  CurrentUser,
  type UserSession,
} from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FeaturesService } from '../features/features.service';
import { AuditService } from './audit.service';
import type { AuditLogRow } from './drizzle-audit-log.repository';

@Controller('audit-logs')
@UseGuards(SessionGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly featuresService: FeaturesService,
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: UserSession,
    @Query(new ZodValidationPipe(AuditLogQueryParamsSchema))
    params: AuditLogQueryParams,
  ) {
    const { features } = await this.featuresService.getTenantFeatures(
      user.tenantId,
    );

    if (!features.auditLogs) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'getAuditLogs',
        reason: 'Audit Logs requires Enterprise subscription',
      });
    }

    const { items, total } = await this.auditService.findAll(
      user.tenantId,
      user.mid,
      params,
    );

    return {
      items: items.map(toResponse),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}

function toResponse(row: AuditLogRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    mid: row.mid,
    eventType: row.eventType,
    actorType: row.actorType,
    actorId: row.actorId,
    targetId: row.targetId,
    metadata: row.metadata,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}
