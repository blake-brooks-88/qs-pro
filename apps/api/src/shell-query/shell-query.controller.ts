import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  InternalServerErrorException,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Inject,
  HttpException,
  Sse,
  Param,
  Get,
  Query,
} from '@nestjs/common';
import { ShellQueryService } from './shell-query.service';
import { SessionGuard } from '../auth/session.guard';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { z } from 'zod';
import { Observable, fromEvent, map, filter, finalize } from 'rxjs';

const createRunSchema = z.object({
  sqlText: z.string().min(1, 'SQL text is required'),
  snippetName: z.string().optional(),
});

@Controller('runs')
@UseGuards(SessionGuard)
export class ShellQueryController {
  constructor(
    private readonly shellQueryService: ShellQueryService,
    @Inject('TENANT_REPOSITORY') private tenantRepo: any,
    @Inject('REDIS_CLIENT') private readonly redis: any,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRun(@CurrentUser() user: UserSession, @Body() body: unknown) {
    const result = createRunSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors);
    }

    const { sqlText, snippetName } = result.data;

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
      );

      return { runId, status: 'queued' };
    } catch (error: any) {
      if (error.message.includes('Rate limit')) {
        throw new HttpException(error.message, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new InternalServerErrorException(error.message);
    }
  }

  @Sse(':runId/events')
  async streamEvents(
    @Param('runId') runId: string,
    @CurrentUser() user: UserSession,
  ): Promise<Observable<MessageEvent>> {
    // 1. Verify ownership
    const run = await this.shellQueryService.getRun(runId, user.tenantId);
    if (!run) {
      throw new BadRequestException('Run not found or unauthorized');
    }

    // 2. Rate limiting (max 5 simultaneous SSE per user)
    const limitKey = `sse-limit:${user.userId}`;
    const currentConnections = await this.redis.incr(limitKey);
    await this.redis.expire(limitKey, 3600); // 1 hour TTL

    if (currentConnections > 5) {
      await this.redis.decr(limitKey);
      throw new HttpException(
        'Too many active connections',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    let subRedis: any;
    try {
      const channel = `run-status:${runId}`;
      subRedis = this.redis.duplicate();
      await subRedis.subscribe(channel);

      return fromEvent<[string, string]>(subRedis, 'message').pipe(
        filter(([receivedChannel]) => channel === receivedChannel),
        map(([, message]) => {
          return { data: JSON.parse(message) } as MessageEvent;
        }),
        finalize(() => {
          subRedis.quit().catch(() => {});
          this.redis.decr(limitKey).catch(() => {});
        }),
      );
    } catch (error) {
      await this.redis.decr(limitKey);
      throw error;
    }
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
    return this.shellQueryService.cancelRun(runId, user.tenantId);
  }
}
