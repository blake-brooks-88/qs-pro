import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { RlsContextService } from '../database/rls-context.service';
import { shellQueryRuns } from '@qs-pro/database';
import { eq, and, notInArray, count } from 'drizzle-orm';
import * as crypto from 'crypto';
import { MceBridgeService } from '../mce/mce-bridge.service';

export interface ShellQueryContext {
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  accessToken: string;
}

@Injectable()
export class ShellQueryService {
  private readonly logger = new Logger(ShellQueryService.name);

  constructor(
    @InjectQueue('shell-query') private shellQueryQueue: Queue,
    private rlsContext: RlsContextService,
    @Inject('DATABASE') private db: any,
    private mceBridge: MceBridgeService,
  ) {}

  async createRun(
    context: ShellQueryContext,
    sqlText: string,
    snippetName?: string,
  ): Promise<string> {
    const runId = uuidv4();
    const sqlTextHash = crypto
      .createHash('sha256')
      .update(sqlText)
      .digest('hex');

    // 1. Check Rate Limit
    const activeRuns = await this.countActiveRuns(context.userId);
    if (activeRuns >= 10) {
      throw new Error(
        'Rate limit exceeded: Max 10 concurrent shell queries per user.',
      );
    }

    // 2. Persist initial state to DB
    await this.rlsContext.runWithTenantContext(
      context.tenantId,
      context.mid,
      async () => {
        await this.db.insert(shellQueryRuns).values({
          id: runId,
          tenantId: context.tenantId,
          userId: context.userId,
          mid: context.mid,
          snippetName,
          sqlTextHash,
          status: 'queued',
        });
      },
    );

    // 3. Add to Queue
    await this.shellQueryQueue.add(
      'execute-shell-query',
      {
        runId,
        ...context,
        sqlText,
        snippetName,
      },
      {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { age: 3600 }, // 1 hour
        removeOnFail: { age: 86400 }, // 24 hours
        jobId: runId, // Use runId as BullMQ jobId for easy lookup
      },
    );

    this.logger.log(
      `Queued shell query run ${runId} for user ${context.userId}`,
    );

    return runId;
  }

  async getRun(runId: string, tenantId: string) {
    const results = await this.db
      .select()
      .from(shellQueryRuns)
      .where(
        and(
          eq(shellQueryRuns.id, runId),
          eq(shellQueryRuns.tenantId, tenantId),
        ),
      );

    return results[0];
  }

  async getResults(
    runId: string,
    tenantId: string,
    userId: string,
    mid: string,
    page: number,
  ) {
    const run = await this.getRun(runId, tenantId);
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    if (run.status !== 'ready') {
      if (run.status === 'failed') {
        throw new ConflictException(`Run failed: ${run.errorMessage}`);
      }
      throw new ConflictException(`Run is still ${run.status}`);
    }

    // Proxy to MCE REST Rowset API
    // The DE name follows the convention: QPP_[SnippetName]_[Hash]
    const hash = run.id.substring(0, 4);
    const deName = run.snippetName
      ? `QPP_${run.snippetName.replace(/\s+/g, '_')}_${hash}`
      : `QPP_Results_${hash}`;

    const pageSize = 50;
    const url = `/data/v1/customobjectdata/key/${deName}/rowset?$page=${page}&$pageSize=${pageSize}`;

    try {
      const response = await this.mceBridge.request(tenantId, userId, mid, {
        method: 'GET',
        url,
      });
      return response;
    } catch (e: any) {
      this.logger.error(
        `Failed to fetch results for run ${runId}: ${e.message}`,
      );
      throw e;
    }
  }

  async cancelRun(runId: string, tenantId: string) {
    const run = await this.getRun(runId, tenantId);
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    if (
      run.status === 'ready' ||
      run.status === 'failed' ||
      run.status === 'canceled'
    ) {
      return {
        status: run.status,
        message: 'Run already completed or canceled',
      };
    }

    await this.rlsContext.runWithTenantContext(tenantId, run.mid, async () => {
      await this.db
        .update(shellQueryRuns)
        .set({ status: 'canceled', completedAt: new Date() })
        .where(eq(shellQueryRuns.id, runId));
    });

    return { status: 'canceled', runId };
  }

  private async countActiveRuns(userId: string): Promise<number> {
    const result = await this.db
      .select({ count: count() })
      .from(shellQueryRuns)
      .where(
        and(
          eq(shellQueryRuns.userId, userId),
          notInArray(shellQueryRuns.status, ['ready', 'failed', 'canceled']),
        ),
      );

    return result[0]?.count || 0;
  }
}
