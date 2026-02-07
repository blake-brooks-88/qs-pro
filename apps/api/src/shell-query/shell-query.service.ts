import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  buildQppResultsDataExtensionName,
  EncryptionService,
  ErrorCode,
  RestDataService,
  type RowsetResponse,
} from '@qpp/backend-shared';
import type { TableMetadata } from '@qpp/shared-types';
import { Queue } from 'bullmq';
import * as crypto from 'crypto';

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

export interface RunResultsResponse {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class ShellQueryService {
  private readonly logger = new Logger(ShellQueryService.name);

  constructor(
    @InjectQueue('shell-query') private shellQueryQueue: Queue,
    private restDataService: RestDataService,
    @Inject('SHELL_QUERY_RUN_REPOSITORY')
    private readonly runRepo: ShellQueryRunRepository,
    private readonly encryptionService: EncryptionService,
  ) {}

  async createRun(
    context: ShellQueryContext,
    sqlText: string,
    snippetName?: string,
    tableMetadata?: TableMetadata,
    targetDeCustomerKey?: string,
    targetUpdateType?: 'Overwrite' | 'Append' | 'Update',
  ): Promise<string> {
    const normalizedSnippetName = snippetName?.trim();
    const truncatedSnippetName = normalizedSnippetName
      ? normalizedSnippetName.slice(0, 100)
      : undefined;

    const runId = crypto.randomUUID();
    const sqlTextHash = crypto
      .createHash('sha256')
      .update(sqlText)
      .digest('hex');

    // 1. Check Rate Limit
    const activeRuns = await this.runRepo.countActiveRuns(
      context.tenantId,
      context.mid,
      context.userId,
    );
    if (activeRuns >= 10) {
      throw new AppError(ErrorCode.RATE_LIMIT_EXCEEDED, undefined, {
        activeRuns,
        maxConcurrent: 10,
        userId: context.userId,
      });
    }

    // 2. Persist initial state to DB
    await this.runRepo.createRun({
      id: runId,
      tenantId: context.tenantId,
      userId: context.userId,
      mid: context.mid,
      snippetName: truncatedSnippetName,
      targetDeCustomerKey,
      targetUpdateType,
      sqlTextHash,
      status: 'queued',
    });

    // 3. Add to Queue (encrypt sqlText for at-rest security in Redis)
    const encryptedSqlText = this.encryptionService.encrypt(sqlText);
    if (!encryptedSqlText) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, undefined, {
        operation: 'createRun',
        reason: 'Failed to encrypt sqlText',
      });
    }
    await this.shellQueryQueue.add(
      'execute-shell-query',
      {
        runId,
        ...context,
        sqlText: encryptedSqlText,
        snippetName: truncatedSnippetName,
        tableMetadata,
        targetDeCustomerKey,
        targetUpdateType,
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

  async getRun(runId: string, tenantId: string, mid: string, userId: string) {
    return this.runRepo.findRun(runId, tenantId, mid, userId);
  }

  async getRunStatus(
    runId: string,
    tenantId: string,
    mid: string,
    userId: string,
  ): Promise<RunStatusResponse> {
    const run = await this.runRepo.findRun(runId, tenantId, mid, userId);
    if (!run) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'getRunStatus',
        runId,
      });
    }

    const response: RunStatusResponse = {
      runId: run.id,
      status: run.status,
      createdAt: run.createdAt,
      updatedAt: run.completedAt ?? run.startedAt ?? run.createdAt,
    };

    if (run.status === 'failed' && run.errorMessage) {
      const decryptedError = this.tryDecrypt(run.errorMessage, {
        operation: 'getRunStatus',
        runId: run.id,
      });
      if (decryptedError) {
        response.errorMessage = decryptedError;
      }
    }

    return response;
  }

  async getResults(
    runId: string,
    tenantId: string,
    userId: string,
    mid: string,
    page: number,
  ): Promise<RunResultsResponse> {
    const run = await this.getRun(runId, tenantId, mid, userId);
    if (!run) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'getResults',
        runId,
      });
    }

    if (run.status !== 'ready') {
      if (run.status === 'failed') {
        throw new AppError(ErrorCode.INVALID_STATE, undefined, {
          operation: 'getResults',
          status: run.status,
          statusMessage: run.errorMessage
            ? this.tryDecrypt(run.errorMessage, {
                operation: 'getResults',
                runId: run.id,
              })
            : undefined,
        });
      }
      throw new AppError(ErrorCode.INVALID_STATE, undefined, {
        operation: 'getResults',
        status: run.status,
      });
    }

    // Proxy to MCE REST Rowset API
    // Use target DE if specified, otherwise temp DE naming convention
    const deKey =
      run.targetDeCustomerKey ??
      buildQppResultsDataExtensionName(run.id, run.snippetName);

    const pageSize = 50;

    this.logger.debug(`Fetching results for run ${runId}`);

    try {
      const mceResponse = await this.restDataService.getRowset(
        tenantId,
        userId,
        mid,
        deKey,
        page,
        pageSize,
      );

      this.logger.debug(
        `MCE rowset response: count=${mceResponse.count ?? 0}, page=${mceResponse.page ?? 1}`,
      );

      return this.normalizeRowsetResponse(mceResponse, page, pageSize);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.logger.error(`Failed to fetch results for run ${runId}: ${message}`);
      throw e;
    }
  }

  private normalizeRowsetResponse(
    mceResponse: RowsetResponse,
    page: number,
    pageSize: number,
  ): RunResultsResponse {
    const items = mceResponse.items ?? [];

    const allKeys = new Set<string>();
    for (const item of items) {
      if (item.keys) {
        for (const key of Object.keys(item.keys)) {
          allKeys.add(key);
        }
      }
      if (item.values) {
        for (const key of Object.keys(item.values)) {
          allKeys.add(key);
        }
      }
    }
    const columns = Array.from(allKeys);

    const rows = items.map((item) => ({
      ...item.keys,
      ...item.values,
    }));

    return {
      columns,
      rows,
      totalRows: mceResponse.count ?? 0,
      page: mceResponse.page ?? page,
      pageSize: mceResponse.pageSize ?? pageSize,
    };
  }

  async cancelRun(
    runId: string,
    tenantId: string,
    mid: string,
    userId: string,
  ) {
    const run = await this.getRun(runId, tenantId, mid, userId);
    if (!run) {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, undefined, {
        operation: 'cancelRun',
        runId,
      });
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

    await this.runRepo.markCanceled(runId, tenantId, mid, userId);

    return { status: 'canceled', runId };
  }

  private tryDecrypt(
    value: string,
    context: { operation: string; runId: string },
  ): string | undefined {
    try {
      return this.encryptionService.decrypt(value) ?? undefined;
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      this.logger.warn(
        `Failed to decrypt shell query field (operation=${context.operation}, runId=${context.runId}): ${message}`,
      );
      return undefined;
    }
  }
}
