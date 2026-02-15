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
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import { HistoryQueryParamsSchema } from '@qpp/shared-types';
import type { Observable } from 'rxjs';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FeaturesService } from '../features/features.service';
import { FREE_TIER_RUN_LIMIT, UsageService } from '../usage/usage.service';
import { RunExistsGuard } from './guards/run-exists.guard';
import { ShellQueryService } from './shell-query.service';
import { ShellQuerySseService } from './shell-query-sse.service';

const createRunSchema = z.object({
  sqlText: z.string().min(1, 'SQL text is required').max(100_000),
  // Snippet name is truncated to 100 chars server-side, but accept a larger input to
  // preserve backward compatibility with callers that don't pre-trim.
  snippetName: z.string().max(1000).optional(),
  targetDeCustomerKey: z.string().trim().min(1).max(200).optional(),
  targetUpdateType: z.enum(['Overwrite', 'Append', 'Update']).optional(),
  savedQueryId: z.string().uuid().optional(),
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
    private readonly featuresService: FeaturesService,
    private readonly usageService: UsageService,
    @Inject('TENANT_REPOSITORY') private tenantRepo: TenantRepository,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRun(@CurrentUser() user: UserSession, @Body() body: unknown) {
    const result = createRunSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    const {
      sqlText,
      snippetName,
      targetDeCustomerKey,
      targetUpdateType,
      savedQueryId,
      tableMetadata,
    } = result.data;

    const { tier, features: tenantFeatures } =
      await this.featuresService.getTenantFeatures(user.tenantId);

    if (tier === 'free') {
      const monthlyCount = await this.usageService.getMonthlyRunCount(
        user.tenantId,
        user.mid,
        user.userId,
      );
      if (monthlyCount >= FREE_TIER_RUN_LIMIT) {
        throw new AppError(ErrorCode.QUOTA_EXCEEDED, undefined, {
          operation: 'createRun',
          reason: `Monthly run limit reached: ${monthlyCount}/${FREE_TIER_RUN_LIMIT}`,
        });
      }
    }

    if (targetDeCustomerKey) {
      if (!tenantFeatures.runToTargetDE) {
        throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
          operation: 'runToTargetDE',
          reason: 'Run to Target DE requires Pro subscription',
        });
      }
    }

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
        targetDeCustomerKey,
        targetUpdateType,
        savedQueryId,
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

  @Get('history')
  async getHistory(@CurrentUser() user: UserSession, @Query() query: unknown) {
    const { features: tenantFeatures } =
      await this.featuresService.getTenantFeatures(user.tenantId);

    if (!tenantFeatures.executionHistory) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'getHistory',
        reason: 'Execution History requires Pro subscription',
      });
    }

    const result = HistoryQueryParamsSchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    return this.shellQueryService.listHistory(
      user.tenantId,
      user.mid,
      user.userId,
      result.data,
    );
  }

  @Get(':runId/sql')
  async getRunSqlText(
    @Param('runId') runId: string,
    @CurrentUser() user: UserSession,
  ) {
    const { features: tenantFeatures } =
      await this.featuresService.getTenantFeatures(user.tenantId);

    if (!tenantFeatures.executionHistory) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'getRunSqlText',
        reason: 'Execution History requires Pro subscription',
      });
    }

    const sql = await this.shellQueryService.getRunSqlText(
      runId,
      user.tenantId,
      user.mid,
      user.userId,
    );

    if (sql === null) {
      throw new NotFoundException('SQL text not found for this run');
    }

    return { sql };
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
  @UseGuards(RunExistsGuard)
  async streamEvents(
    @Param('runId') runId: string,
    @CurrentUser() user: UserSession,
  ): Promise<Observable<MessageEvent>> {
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
