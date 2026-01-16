import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

import { MceBridgeService } from '../mce/mce-bridge.service';
import type { ShellQueryRunRepository } from './shell-query-run.repository';

export interface ShellQueryContext {
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  accessToken: string;
}

export interface RunStatusResponse {
  runId: string;
  status: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ShellQueryService {
  private readonly logger = new Logger(ShellQueryService.name);

  constructor(
    @InjectQueue('shell-query') private shellQueryQueue: Queue,
    private mceBridge: MceBridgeService,
    @Inject('SHELL_QUERY_RUN_REPOSITORY')
    private readonly runRepo: ShellQueryRunRepository,
  ) {}

  async createRun(
    context: ShellQueryContext,
    sqlText: string,
    snippetName?: string,
  ): Promise<string> {
    const runId = crypto.randomUUID();
    const sqlTextHash = crypto
      .createHash('sha256')
      .update(sqlText)
      .digest('hex');

    // 1. Check Rate Limit
    const activeRuns = await this.runRepo.countActiveRuns(context.userId);
    if (activeRuns >= 10) {
      throw new Error(
        'Rate limit exceeded: Max 10 concurrent shell queries per user.',
      );
    }

    // 2. Persist initial state to DB
    await this.runRepo.createRun({
      id: runId,
      tenantId: context.tenantId,
      userId: context.userId,
      mid: context.mid,
      snippetName,
      sqlTextHash,
      status: 'queued',
    });

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
    return this.runRepo.findRun(runId, tenantId);
  }

  async getRunStatus(
    runId: string,
    tenantId: string,
  ): Promise<RunStatusResponse> {
    const run = await this.runRepo.findRun(runId, tenantId);
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    const response: RunStatusResponse = {
      runId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.completedAt ?? run.startedAt ?? run.createdAt,
    };

    if (run.status === 'failed' && run.errorMessage) {
      response.errorMessage = run.errorMessage;
    }

    return response;
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
    } catch (e: unknown) {
      const error = e as { message?: string };
      this.logger.error(
        `Failed to fetch results for run ${runId}: ${error.message}`,
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

    await this.runRepo.markCanceled(runId, tenantId, run.mid);

    return { status: 'canceled', runId };
  }
}
