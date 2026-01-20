import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { ShellQuerySweeper } from '../src/shell-query/shell-query.sweeper';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import {
  RlsContextService,
  MceBridgeService,
  AsyncStatusService,
  QueryDefinitionService,
  RestDataService,
} from '@qpp/backend-shared';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockBullJob, createMockPollBullJob } from './factories';
import {
  createDbStub,
  createMceBridgeStub,
  createRedisStub,
  createMetricsStub,
  createRlsContextStub,
  createQueueStub,
  createAsyncStatusServiceStub,
  createQueryDefinitionServiceStub,
  createRestDataServiceStub,
} from './stubs';

describe('Shell Query Cancellation & Sweeper', () => {
  let processor: ShellQueryProcessor;
  let sweeper: ShellQuerySweeper;
  let mockDb: ReturnType<typeof createDbStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockRestDataService: ReturnType<typeof createRestDataServiceStub>;
  let mockRedis: ReturnType<typeof createRedisStub>;
  let mockQueue: ReturnType<typeof createQueueStub>;
  let mockAsyncStatusService: ReturnType<typeof createAsyncStatusServiceStub>;
  let mockQueryDefinitionService: ReturnType<typeof createQueryDefinitionServiceStub>;
  let mockRunToTempFlow: { execute: ReturnType<typeof vi.fn>; retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
    mockRestDataService = createRestDataServiceStub();
    mockRedis = createRedisStub();
    mockQueue = createQueueStub();
    mockAsyncStatusService = createAsyncStatusServiceStub();
    mockQueryDefinitionService = createQueryDefinitionServiceStub();
    mockRunToTempFlow = {
      execute: vi.fn().mockResolvedValue({
        taskId: 'task-123',
        queryDefinitionId: 'query-def-123',
      }),
      retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue(null),
    };
    const mockMetrics = createMetricsStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryProcessor,
        ShellQuerySweeper,
        { provide: RunToTempFlow, useValue: mockRunToTempFlow },
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: RestDataService, useValue: mockRestDataService },
        { provide: AsyncStatusService, useValue: mockAsyncStatusService },
        { provide: QueryDefinitionService, useValue: mockQueryDefinitionService },
        { provide: RlsContextService, useValue: createRlsContextStub() },
        { provide: 'DATABASE', useValue: mockDb },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: 'METRICS_JOBS_TOTAL', useValue: mockMetrics },
        { provide: 'METRICS_DURATION', useValue: mockMetrics },
        { provide: 'METRICS_FAILURES_TOTAL', useValue: mockMetrics },
        { provide: 'METRICS_ACTIVE_JOBS', useValue: mockMetrics },
        { provide: getQueueToken('shell-query'), useValue: mockQueue },
      ],
    }).compile();

    processor = module.get<ShellQueryProcessor>(ShellQueryProcessor);
    sweeper = module.get<ShellQuerySweeper>(ShellQuerySweeper);
    processor.setTestMode(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cancellation', () => {
    it('should stop polling when job status changes to canceled in DB', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
      });

      mockDb.setSelectResult([{ status: 'canceled' }]);

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'canceled', runId: 'run-1' });
      expect(mockRedis.publish).toHaveBeenCalledWith(
        expect.stringContaining('run-status:'),
        expect.stringContaining('canceled'),
      );
    });

    it('should attempt cleanup when poll job detects cancellation', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        queryDefinitionId: '', // Force retrieve path
      });

      mockDb.setSelectResult([{ status: 'canceled' }]);
      mockRunToTempFlow.retrieveQueryDefinitionObjectId.mockResolvedValue('obj-123');

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'canceled', runId: 'run-1' });
      expect(mockRunToTempFlow.retrieveQueryDefinitionObjectId).toHaveBeenCalledWith(
        't1', 'u1', 'm1',
        expect.stringContaining('QPP_Query_'),
      );
      expect(mockMceBridge.soapRequest).toHaveBeenCalled();
    });

    it('should cleanup on execute job failure', async () => {
      const job = createMockBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
      });

      const failureRunToTempFlow = {
        execute: vi.fn().mockRejectedValue(new Error('Flow error')),
        retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue('query-def-123'),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ShellQueryProcessor,
          { provide: RunToTempFlow, useValue: failureRunToTempFlow },
          { provide: MceBridgeService, useValue: mockMceBridge },
          { provide: RestDataService, useValue: createRestDataServiceStub() },
          { provide: AsyncStatusService, useValue: createAsyncStatusServiceStub() },
          { provide: RlsContextService, useValue: createRlsContextStub() },
          { provide: 'DATABASE', useValue: mockDb },
          { provide: 'REDIS_CLIENT', useValue: mockRedis },
          { provide: 'METRICS_JOBS_TOTAL', useValue: createMetricsStub() },
          { provide: 'METRICS_DURATION', useValue: createMetricsStub() },
          { provide: 'METRICS_FAILURES_TOTAL', useValue: createMetricsStub() },
          { provide: 'METRICS_ACTIVE_JOBS', useValue: createMetricsStub() },
          { provide: getQueueToken('shell-query'), useValue: mockQueue },
        ],
      }).compile();

      const testProcessor = module.get<ShellQueryProcessor>(ShellQueryProcessor);
      testProcessor.setTestMode(true);

      await expect(testProcessor.process(job as any)).rejects.toThrow('Flow error');

      expect(failureRunToTempFlow.retrieveQueryDefinitionObjectId).toHaveBeenCalledWith(
        't1', 'u1', 'm1',
        expect.stringContaining('QPP_Query_'),
      );
      expect(mockMceBridge.soapRequest).toHaveBeenCalled();
    });
  });

  describe('Sweeper', () => {
    it('should use stored qppFolderId and delete old QueryDefinitions', async () => {
      let queryCount = 0;
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            queryCount++;
            if (queryCount === 1) {
              return [{ tenantId: 't1', mid: 'm1', qppFolderId: 123 }];
            }
            return {
              limit: vi.fn(() => [{ userId: 'u1' }]),
            };
          }),
        })),
      }));

      mockQueryDefinitionService.retrieveByFolder.mockResolvedValue([
        { objectId: 'obj-old-1', customerKey: 'QPP_Query_old-run-1', name: 'QPP_Query_old-run-1' },
      ]);

      await sweeper.handleSweep();

      expect(mockQueryDefinitionService.retrieveByFolder).toHaveBeenCalledWith(
        't1', 'u1', 'm1',
        123,
        expect.any(Date),
      );
      expect(mockQueryDefinitionService.delete).toHaveBeenCalledWith(
        't1', 'u1', 'm1',
        'obj-old-1',
      );
    });

    it('should handle no QueryDefinitions gracefully', async () => {
      let queryCount = 0;
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            queryCount++;
            if (queryCount === 1) {
              return [{ tenantId: 't1', mid: 'm1', qppFolderId: 123 }];
            }
            return {
              limit: vi.fn(() => [{ userId: 'u1' }]),
            };
          }),
        })),
      }));

      mockQueryDefinitionService.retrieveByFolder.mockResolvedValue([]);

      await expect(sweeper.handleSweep()).resolves.not.toThrow();
      expect(mockQueryDefinitionService.delete).not.toHaveBeenCalled();
    });

    it('should handle multiple QueryDefinitions in folder', async () => {
      let queryCount = 0;
      mockDb.select = vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            queryCount++;
            if (queryCount === 1) {
              return [{ tenantId: 't1', mid: 'm1', qppFolderId: 123 }];
            }
            return {
              limit: vi.fn(() => [{ userId: 'u1' }]),
            };
          }),
        })),
      }));

      mockQueryDefinitionService.retrieveByFolder.mockResolvedValue([
        { objectId: 'obj-1', customerKey: 'QPP_Query_1', name: 'QPP_Query_1' },
        { objectId: 'obj-2', customerKey: 'QPP_Query_2', name: 'QPP_Query_2' },
      ]);

      await sweeper.handleSweep();

      expect(mockQueryDefinitionService.delete).toHaveBeenCalledTimes(2);
      expect(mockQueryDefinitionService.delete).toHaveBeenCalledWith('t1', 'u1', 'm1', 'obj-1');
      expect(mockQueryDefinitionService.delete).toHaveBeenCalledWith('t1', 'u1', 'm1', 'obj-2');
    });
  });
});
