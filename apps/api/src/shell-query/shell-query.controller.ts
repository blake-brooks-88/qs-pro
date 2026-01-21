import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AppError } from '@qpp/backend-shared';
import type { Observable } from 'rxjs';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import { SessionGuard } from '../auth/session.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ShellQueryService } from './shell-query.service';
import { ShellQuerySseService } from './shell-query-sse.service';

const createRunSchema = z.object({
  sqlText: z.string().min(1, 'SQL text is required').max(100_000),
  snippetName: z.string().max(100).optional(),
  tableMetadata: z
    .record(
      z.string().max(128),
      z
        .array(
          z.object({
            Name: z.string().max(128),
            FieldType: z.string().max(32),
            MaxLength: z.number().int().min(1).max(4000).optional(),
          }),
        )
        .max(500),
    )
    .refine((data) => !data || Object.keys(data).length <= 50, {
      message: 'Maximum 50 tables allowed',
    })
    .optional(),
});

type TenantRepository = {
  findById(tenantId: string): Promise<{ eid: string } | null>;
};

@Controller('runs')
@UseGuards(SessionGuard, CsrfGuard)
export class ShellQueryController {
  constructor(
    private readonly shellQueryService: ShellQueryService,
    private readonly shellQuerySse: ShellQuerySseService,
    @Inject('TENANT_REPOSITORY') private tenantRepo: TenantRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRun(@CurrentUser() user: UserSession, @Body() body: unknown) {
    const result = createRunSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    const { sqlText, snippetName, tableMetadata } = result.data;

    try {
      // Fetch EID for the current tenant
      const tenant = await this.tenantRepo.findById(user.tenantId);
      if (!tenant) {
        throw new InternalServerErrorException('Tenant not found');
      }

      const runId = await this.shellQueryService.createRun(
        {
          tenantId: user.tenantId,
          userId: user.userId,
          mid: user.mid,
          eid: tenant.eid,
          accessToken: '', // Worker will resolve tokens using AuthModule
        },
        sqlText,
        snippetName,
        tableMetadata,
      );

      return { runId, status: 'queued' };
    } catch (error: unknown) {
      // Let AppError propagate to GlobalExceptionFilter for proper handling
      if (error instanceof AppError) {
        throw error;
      }
      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  @Get(':runId')
  async getRunStatus(
    @Param('runId') runId: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.shellQueryService.getRunStatus(
      runId,
      user.tenantId,
      user.mid,
      user.userId,
    );
  }

  @Sse(':runId/events')
  async streamEvents(
    @Param('runId') runId: string,
    @CurrentUser() user: UserSession,
  ): Promise<Observable<MessageEvent>> {
    // 1. Verify ownership
    const run = await this.shellQueryService.getRun(
      runId,
      user.tenantId,
      user.mid,
      user.userId,
    );
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return this.shellQuerySse.streamRunEvents(runId, user.userId);
  }

  @Get(':runId/results')
  async getResults(
    @Param('runId') runId: string,
    @Query('page') page: string = '1',
    @CurrentUser() user: UserSession,
  ) {
    const pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Invalid page number');
    }
    if (pageNum > 50) {
      throw new BadRequestException('Page number exceeds maximum of 50');
    }

    return this.shellQueryService.getResults(
      runId,
      user.tenantId,
      user.userId,
      user.mid,
      pageNum,
    );
  }

  @Post(':runId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRun(
    @Param('runId') runId: string,
    @CurrentUser() user: UserSession,
  ) {
    return this.shellQueryService.cancelRun(
      runId,
      user.tenantId,
      user.mid,
      user.userId,
    );
  }
}
