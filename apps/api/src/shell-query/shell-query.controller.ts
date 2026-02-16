import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AppError, ErrorCode, SessionGuard } from '@qpp/backend-shared';
import type { HistoryQueryParams } from '@qpp/shared-types';
import { HistoryQueryParamsSchema } from '@qpp/shared-types';
import type { Observable } from 'rxjs';
import { z } from 'zod';

import { CsrfGuard } from '../auth/csrf.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
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

type CreateRunDto = z.infer<typeof createRunSchema>;

const getResultsPageSchema = z.object({
  page: z.coerce.number().int().min(1).max(50).default(1),
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
  async createRun(
    @CurrentUser() user: UserSession,
    @Body(new ZodValidationPipe(createRunSchema)) dto: CreateRunDto,
  ) {
    const {
      sqlText,
      snippetName,
      targetDeCustomerKey,
      targetUpdateType,
      savedQueryId,
      tableMetadata,
    } = dto;

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
  async getHistory(
    @CurrentUser() user: UserSession,
    @Query(new ZodValidationPipe(HistoryQueryParamsSchema))
    params: HistoryQueryParams,
  ) {
    const { features: tenantFeatures } =
      await this.featuresService.getTenantFeatures(user.tenantId);

    if (!tenantFeatures.executionHistory) {
      throw new AppError(ErrorCode.FEATURE_NOT_ENABLED, undefined, {
        operation: 'getHistory',
        reason: 'Execution History requires Pro subscription',
      });
    }

    return this.shellQueryService.listHistory(
      user.tenantId,
      user.mid,
      user.userId,
      params,
    );
  }

  @Get(':runId/sql')
  async getRunSqlText(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
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
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
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
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @CurrentUser() user: UserSession,
  ): Promise<Observable<MessageEvent>> {
    return this.shellQuerySse.streamRunEvents(runId, user.userId);
  }

  @Get(':runId/results')
  async getResults(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
    @Query(new ZodValidationPipe(getResultsPageSchema))
    query: { page: number },
    @CurrentUser() user: UserSession,
  ) {
    return this.shellQueryService.getResults(
      runId,
      user.tenantId,
      user.userId,
      user.mid,
      query.page,
    );
  }

  @Post(':runId/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRun(
    @Param('runId', new ParseUUIDPipe({ version: '4' })) runId: string,
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
