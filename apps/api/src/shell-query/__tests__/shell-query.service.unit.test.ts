import { getQueueToken } from '@nestjs/bullmq';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  EncryptionService,
  ErrorCode,
  RestDataService,
} from '@qpp/backend-shared';
import {
  createEncryptionServiceStub,
  createMockShellQueryContext,
  createMockShellQueryRun,
  createQueueStub,
  createRestDataServiceStub,
  createShellQueryRunRepoStub,
  resetFactories,
} from '@qpp/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import { ShellQueryService } from '../shell-query.service';

describe('ShellQueryService', () => {
  let service: ShellQueryService;
  let queueStub: ReturnType<typeof createQueueStub>;
  let repoStub: ReturnType<typeof createShellQueryRunRepoStub>;
  let encryptionStub: ReturnType<typeof createEncryptionServiceStub>;
  let restDataStub: ReturnType<typeof createRestDataServiceStub>;

  beforeEach(async () => {
    resetFactories();

    queueStub = createQueueStub();
    repoStub = createShellQueryRunRepoStub();
    encryptionStub = createEncryptionServiceStub();
    restDataStub = createRestDataServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryService,
        {
          provide: getQueueToken('shell-query'),
          useValue: queueStub,
        },
        {
          provide: 'SHELL_QUERY_RUN_REPOSITORY',
          useValue: repoStub,
        },
        {
          provide: EncryptionService,
          useValue: encryptionStub,
        },
        {
          provide: RestDataService,
          useValue: restDataStub,
        },
      ],
    }).compile();

    service = module.get(ShellQueryService);
  });

  describe('createRun()', () => {
    it('throws RATE_LIMIT_EXCEEDED when user has 10 or more active runs', async () => {
      // Arrange
      const context = createMockShellQueryContext();
      repoStub.countActiveRuns.mockResolvedValue(10);

      // Act & Assert
      await expect(
        service.createRun(context, 'SELECT 1'),
      ).rejects.toMatchObject({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
      });
    });

    it('encrypts SQL text before adding to queue', async () => {
      // Arrange
      const context = createMockShellQueryContext();
      const sqlText = 'SELECT SubscriberKey FROM _Subscribers';
      repoStub.countActiveRuns.mockResolvedValue(0);

      // Act
      await service.createRun(context, sqlText);

      // Assert
      expect(encryptionStub.encrypt).toHaveBeenCalledWith(sqlText);
      expect(queueStub.add).toHaveBeenCalledWith(
        'execute-shell-query',
        expect.objectContaining({
          sqlText: `encrypted:${sqlText}`,
        }),
        expect.any(Object),
      );
    });

    it('creates queue job with correct options', async () => {
      // Arrange
      const context = createMockShellQueryContext();
      repoStub.countActiveRuns.mockResolvedValue(0);

      // Act
      await service.createRun(context, 'SELECT 1');

      // Assert
      expect(queueStub.add).toHaveBeenCalledWith(
        'execute-shell-query',
        expect.any(Object),
        expect.objectContaining({
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 3600 },
          removeOnFail: { age: 86400 },
        }),
      );
    });

    it('truncates snippet name to 100 characters', async () => {
      // Arrange
      const context = createMockShellQueryContext();
      const longSnippetName = 'A'.repeat(150);
      repoStub.countActiveRuns.mockResolvedValue(0);

      // Act
      await service.createRun(context, 'SELECT 1', longSnippetName);

      // Assert
      expect(repoStub.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          snippetName: 'A'.repeat(100),
        }),
      );
    });

    it('throws INTERNAL_ERROR when encryption fails', async () => {
      // Arrange
      const context = createMockShellQueryContext();
      repoStub.countActiveRuns.mockResolvedValue(0);
      encryptionStub.encrypt.mockReturnValue(null);

      // Act & Assert
      await expect(
        service.createRun(context, 'SELECT 1'),
      ).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      });
    });

    it('returns the generated runId', async () => {
      // Arrange
      const context = createMockShellQueryContext();
      repoStub.countActiveRuns.mockResolvedValue(0);

      // Act
      const runId = await service.createRun(context, 'SELECT 1');

      // Assert
      expect(runId).toBeDefined();
      expect(typeof runId).toBe('string');
      expect(runId.length).toBeGreaterThan(0);
    });
  });

  describe('getRun()', () => {
    it('delegates to repository with correct parameters', async () => {
      // Arrange
      const run = createMockShellQueryRun();
      repoStub.findRun.mockResolvedValue(run);

      // Act
      await service.getRun('run-1', 'tenant-1', 'mid-1', 'user-1');

      // Assert
      expect(repoStub.findRun).toHaveBeenCalledWith(
        'run-1',
        'tenant-1',
        'mid-1',
        'user-1',
      );
    });

    it('returns null when run does not exist', async () => {
      // Arrange
      repoStub.findRun.mockResolvedValue(null);

      // Act
      const result = await service.getRun(
        'non-existent',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getRunStatus()', () => {
    it('formats status response with correct fields', async () => {
      // Arrange
      const now = new Date();
      const run = createMockShellQueryRun({
        id: 'run-123',
        status: 'queued',
        createdAt: now,
      });
      // Add missing fields that the service expects
      const fullRun = {
        ...run,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(fullRun);

      // Act
      const result = await service.getRunStatus(
        'run-123',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result).toEqual({
        runId: 'run-123',
        status: 'queued',
        createdAt: now,
        updatedAt: now,
      });
    });

    it('decrypts error message for failed runs', async () => {
      // Arrange
      const now = new Date();
      const run = {
        ...createMockShellQueryRun({ id: 'run-fail', status: 'failed' }),
        startedAt: now,
        completedAt: now,
        errorMessage: 'encrypted:Syntax error near SELECT',
      };
      repoStub.findRun.mockResolvedValue(run);

      // Act
      const result = await service.getRunStatus(
        'run-fail',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(encryptionStub.decrypt).toHaveBeenCalledWith(
        'encrypted:Syntax error near SELECT',
      );
      expect(result.errorMessage).toBe('Syntax error near SELECT');
    });

    it('throws RESOURCE_NOT_FOUND when run does not exist', async () => {
      // Arrange
      repoStub.findRun.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getRunStatus('non-existent', 'tenant-1', 'mid-1', 'user-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('uses completedAt for updatedAt when available', async () => {
      // Arrange
      const createdAt = new Date('2026-01-01');
      const startedAt = new Date('2026-01-02');
      const completedAt = new Date('2026-01-03');
      const run = {
        ...createMockShellQueryRun({ status: 'ready' }),
        createdAt,
        startedAt,
        completedAt,
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);

      // Act
      const result = await service.getRunStatus(
        'run-1',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result.updatedAt).toEqual(completedAt);
    });
  });

  describe('getResults()', () => {
    it('throws RESOURCE_NOT_FOUND when run does not exist', async () => {
      // Arrange
      repoStub.findRun.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getResults('non-existent', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws INVALID_STATE with decrypted error for failed runs', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({ status: 'failed' }),
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: 'encrypted:Query timed out',
      };
      repoStub.findRun.mockResolvedValue(run);

      // Act & Assert
      await expect(
        service.getResults('run-fail', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
        context: expect.objectContaining({
          statusMessage: 'Query timed out',
        }),
      });
    });

    it('throws INVALID_STATE for queued runs', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({ status: 'queued' }),
        startedAt: null,
        completedAt: null,
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);

      // Act & Assert
      await expect(
        service.getResults('run-queued', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
        context: expect.objectContaining({
          status: 'queued',
        }),
      });
    });

    it('throws INVALID_STATE for running runs', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({ status: 'running' }),
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);

      // Act & Assert
      await expect(
        service.getResults('run-running', 'tenant-1', 'user-1', 'mid-1', 1),
      ).rejects.toMatchObject({
        code: ErrorCode.INVALID_STATE,
      });
    });

    it('proxies to MCE with correct DE name using runId and snippetName', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({
          id: 'abcd1234-5678-90ab-cdef-1234567890ab',
          status: 'ready',
          snippetName: 'My Query',
        }),
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);
      restDataStub.getRowset.mockResolvedValue({
        items: [],
        count: 0,
        page: 1,
        pageSize: 50,
      });

      // Act
      await service.getResults(run.id, 'tenant-1', 'user-1', 'mid-1', 1);

      // Assert - DE name follows QPP_{snippetName}_{hash} pattern
      expect(restDataStub.getRowset).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'mid-1',
        'QPP_My_Query_abcd1234',
        1,
        50,
      );
    });

    it('normalizes rowset response extracting columns from keys and values', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({ id: 'run-ready', status: 'ready' }),
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);
      restDataStub.getRowset.mockResolvedValue({
        items: [
          {
            keys: { SubscriberKey: 'key1' },
            values: { Email: 'test@example.com' },
          },
          {
            keys: { SubscriberKey: 'key2' },
            values: { Email: 'test2@example.com' },
          },
        ],
        count: 2,
        page: 1,
        pageSize: 50,
      });

      // Act
      const result = await service.getResults(
        'run-ready',
        'tenant-1',
        'user-1',
        'mid-1',
        1,
      );

      // Assert
      expect(result.columns).toContain('SubscriberKey');
      expect(result.columns).toContain('Email');
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0]).toEqual({
        SubscriberKey: 'key1',
        Email: 'test@example.com',
      });
    });

    it('handles empty items array', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({ id: 'run-empty', status: 'ready' }),
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);
      restDataStub.getRowset.mockResolvedValue({
        items: [],
        count: 0,
        page: 1,
        pageSize: 50,
      });

      // Act
      const result = await service.getResults(
        'run-empty',
        'tenant-1',
        'user-1',
        'mid-1',
        1,
      );

      // Assert
      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
    });

    it('respects page and pageSize from MCE response', async () => {
      // Arrange
      const run = {
        ...createMockShellQueryRun({ status: 'ready' }),
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(run);
      restDataStub.getRowset.mockResolvedValue({
        items: [],
        count: 100,
        page: 3,
        pageSize: 50,
      });

      // Act
      const result = await service.getResults(
        'run-1',
        'tenant-1',
        'user-1',
        'mid-1',
        3,
      );

      // Assert
      expect(result.page).toBe(3);
      expect(result.pageSize).toBe(50);
      expect(result.totalRows).toBe(100);
    });
  });

  describe('cancelRun()', () => {
    it('returns already-completed message for terminal states', async () => {
      // Arrange
      const readyRun = {
        ...createMockShellQueryRun({ status: 'ready' }),
        startedAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(readyRun);

      // Act
      const result = await service.cancelRun(
        'run-ready',
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result.status).toBe('ready');
      expect(result.message).toBe('Run already completed or canceled');
      expect(repoStub.markCanceled).not.toHaveBeenCalled();
    });

    it('marks run as canceled for active states', async () => {
      // Arrange
      const queuedRun = {
        ...createMockShellQueryRun({ status: 'queued' }),
        startedAt: null,
        completedAt: null,
        errorMessage: null,
      };
      repoStub.findRun.mockResolvedValue(queuedRun);

      // Act
      const result = await service.cancelRun(
        queuedRun.id,
        'tenant-1',
        'mid-1',
        'user-1',
      );

      // Assert
      expect(result.status).toBe('canceled');
      expect(result.runId).toBe(queuedRun.id);
      expect(repoStub.markCanceled).toHaveBeenCalledWith(
        queuedRun.id,
        'tenant-1',
        'mid-1',
        'user-1',
      );
    });
  });
});
