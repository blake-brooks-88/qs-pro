import * as crypto from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  EncryptionService,
  ErrorCode,
  RestDataService,
} from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ShellQueryContext,
  ShellQueryService,
} from '../shell-query.service';
import type { ShellQueryRunRepository } from '../shell-query-run.repository';

describe('ShellQueryService', () => {
  let service: ShellQueryService;
  let runRepo: ShellQueryRunRepository;
  let queue: { add: ReturnType<typeof vi.fn> };
  let restDataService: { getRowset: ReturnType<typeof vi.fn> };
  let encryptionService: {
    encrypt: ReturnType<typeof vi.fn>;
    decrypt: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    restDataService = { getRowset: vi.fn() };
    encryptionService = {
      encrypt: vi.fn((value: string) => `encrypted:${value}`),
      decrypt: vi.fn((value: string) => value.replace(/^encrypted:/, '')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryService,
        {
          provide: getQueueToken('shell-query'),
          useValue: { add: vi.fn() },
        },
        {
          provide: RestDataService,
          useValue: restDataService,
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
        { provide: EncryptionService, useValue: encryptionService },
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
    const encryptedSqlText = `encrypted:${sqlText}`;
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
    expect(runRepo.countActiveRuns).toHaveBeenCalledWith(
      'tenant-1',
      'mid-1',
      'user-1',
    );
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
        sqlText: encryptedSqlText,
        snippetName: 'Snippet One',
      }),
      expect.objectContaining({
        jobId: runId,
        attempts: 2,
      }),
    );
    expect(encryptionService.encrypt).toHaveBeenCalledWith(sqlText);
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
      /Too many requests/i,
    );
    expect(runRepo.createRun).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  describe('getResults', () => {
    it('proxies to MCE rowset and normalizes keys/values into rows (snippetName)', async () => {
      const runId = '65e9fec9-b080-4835-bfb5-5b5d54814971';

      vi.mocked(runRepo.findRun).mockResolvedValue({
        id: runId,
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        snippetName: 'New Query',
        sqlTextHash: 'hash',
        status: 'ready',
        taskId: null,
        queryDefinitionId: null,
        pollStartedAt: null,
        errorMessage: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: new Date(),
      } as any);

      vi.mocked(restDataService.getRowset).mockResolvedValue({
        pageSize: 50,
        page: 1,
        count: 1,
        items: [
          {
            keys: { id: 1 },
            values: { email: 'test@test.com' },
          },
        ],
      });

      const result = await service.getResults(
        runId,
        'tenant-1',
        'user-1',
        'mid-1',
        1,
      );

      expect(restDataService.getRowset).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
        'QPP_New_Query_65e9fec9',
        1,
        50,
      );

      expect(result).toEqual({
        columns: ['id', 'email'],
        rows: [{ id: 1, email: 'test@test.com' }],
        totalRows: 1,
        page: 1,
        pageSize: 50,
      });
    });

    it('uses the default DE naming convention when snippetName is missing', async () => {
      const runId = 'abcd1234-b080-4835-bfb5-5b5d54814971';

      vi.mocked(runRepo.findRun).mockResolvedValue({
        id: runId,
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        snippetName: null,
        sqlTextHash: 'hash',
        status: 'ready',
        taskId: null,
        queryDefinitionId: null,
        pollStartedAt: null,
        errorMessage: null,
        createdAt: new Date(),
        startedAt: null,
        completedAt: new Date(),
      } as any);

      vi.mocked(restDataService.getRowset).mockResolvedValue({
        pageSize: 50,
        page: 1,
        count: 0,
        items: [],
      });

      const result = await service.getResults(
        runId,
        'tenant-1',
        'user-1',
        'mid-1',
        1,
      );

      expect(restDataService.getRowset).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
        'QPP_Results_abcd1234',
        1,
        50,
      );

      expect(result.totalRows).toBe(0);
      expect(result.rows).toEqual([]);
      expect(result.columns).toEqual([]);
    });

    it('throws RESOURCE_NOT_FOUND when run does not exist', async () => {
      vi.mocked(runRepo.findRun).mockResolvedValue(null);

      await expect(
        service.getResults('missing-run', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws INVALID_STATE when run is not ready', async () => {
      vi.mocked(runRepo.findRun).mockResolvedValue({
        id: 'run-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        snippetName: 'Test',
        sqlTextHash: 'hash',
        status: 'running',
        taskId: null,
        queryDefinitionId: null,
        pollStartedAt: null,
        errorMessage: null,
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: null,
      } as any);

      await expect(
        service.getResults('run-1', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
      });
    });

    it('throws INVALID_STATE with error message when run failed', async () => {
      vi.mocked(runRepo.findRun).mockResolvedValue({
        id: 'run-1',
        tenantId: 'tenant-1',
        userId: 'user-1',
        mid: 'mid-1',
        snippetName: 'Test',
        sqlTextHash: 'hash',
        status: 'failed',
        taskId: null,
        queryDefinitionId: null,
        pollStartedAt: null,
        errorMessage: 'encrypted:Query failed',
        createdAt: new Date(),
        startedAt: new Date(),
        completedAt: new Date(),
      } as any);

      await expect(
        service.getResults('run-1', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
      });
    });
  });
});
