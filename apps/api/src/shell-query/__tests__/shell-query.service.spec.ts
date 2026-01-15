import { Test, type TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getQueueToken } from '@nestjs/bullmq';
import {
  ShellQueryService,
  type ShellQueryContext,
} from '../shell-query.service';
import type { ShellQueryRunRepository } from '../shell-query-run.repository';
import { MceBridgeService } from '../../mce/mce-bridge.service';
import * as crypto from 'node:crypto';

describe('ShellQueryService', () => {
  let service: ShellQueryService;
  let runRepo: ShellQueryRunRepository;
  let queue: { add: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryService,
        {
          provide: getQueueToken('shell-query'),
          useValue: { add: vi.fn() },
        },
        {
          provide: MceBridgeService,
          useValue: { request: vi.fn() },
        },
        {
          provide: 'SHELL_QUERY_RUN_REPOSITORY',
          useValue: {
            createRun: vi.fn(),
            findRun: vi.fn(),
            markCanceled: vi.fn(),
            countActiveRuns: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(ShellQueryService);
    runRepo = module.get('SHELL_QUERY_RUN_REPOSITORY');
    queue = module.get(getQueueToken('shell-query'));
  });

  it('creates a run via repository and enqueues a job', async () => {
    // Arrange
    const context: ShellQueryContext = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      mid: 'mid-1',
      eid: 'eid-1',
      accessToken: '',
    };

    vi.mocked(runRepo.countActiveRuns).mockResolvedValue(0);
    vi.mocked(runRepo.createRun).mockResolvedValue(undefined);
    vi.mocked(queue.add).mockResolvedValue(undefined);

    const sqlText = 'select * from foo';
    const expectedHash = crypto
      .createHash('sha256')
      .update(sqlText)
      .digest('hex');

    // Act
    const runId = await service.createRun(context, sqlText, 'Snippet One');

    // Assert
    expect(runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(runRepo.countActiveRuns).toHaveBeenCalledWith('user-1');
    expect(runRepo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        id: runId,
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        snippetName: 'Snippet One',
        sqlTextHash: expectedHash,
        status: 'queued',
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'execute-shell-query',
      expect.objectContaining({
        runId,
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        eid: 'eid-1',
        sqlText,
        snippetName: 'Snippet One',
      }),
      expect.objectContaining({
        jobId: runId,
        attempts: 2,
      }),
    );
  });

  it('rejects createRun when per-user active run limit is exceeded', async () => {
    // Arrange
    const context: ShellQueryContext = {
      tenantId: 'tenant-1',
      userId: 'user-1',
      mid: 'mid-1',
      eid: 'eid-1',
      accessToken: '',
    };

    vi.mocked(runRepo.countActiveRuns).mockResolvedValue(10);

    // Act / Assert
    await expect(service.createRun(context, 'select 1')).rejects.toThrow(
      /Rate limit exceeded/i,
    );
    expect(runRepo.createRun).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
