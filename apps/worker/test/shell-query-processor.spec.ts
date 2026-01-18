import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { QueryDefinitionService } from '../src/shell-query/query-definition.service';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { RlsContextService, MceBridgeService } from '@qs-pro/backend-shared';
import { DelayedError } from 'bullmq';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockBullJob, createMockPollBullJob } from './factories';
import { createDbStub, createMceBridgeStub, createRedisStub, createMetricsStub, createRlsContextStub, createQueueStub, createQueryDefinitionServiceStub } from './stubs';

describe('ShellQueryProcessor', () => {
  let processor: ShellQueryProcessor;
  let mockDb: ReturnType<typeof createDbStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockRunToTempFlow: { execute: ReturnType<typeof vi.fn>; retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn> };
  let mockQueue: ReturnType<typeof createQueueStub>;

  beforeEach(async () => {
    mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
    mockRunToTempFlow = {
      execute: vi.fn(),
      retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue(null),
    };
    mockQueue = createQueueStub();
    const mockRedis = createRedisStub();
    const mockMetrics = createMetricsStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryProcessor,
        { provide: RunToTempFlow, useValue: mockRunToTempFlow },
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: QueryDefinitionService, useValue: createQueryDefinitionServiceStub() },
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
    processor.setTestMode(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleExecute', () => {
    it('should execute flow and enqueue poll job', async () => {
      const job = createMockBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        eid: 'e1',
        sqlText: 'SELECT 1',
      });

      mockRunToTempFlow.execute.mockResolvedValue({
        taskId: 'task-123',
        queryDefinitionId: 'query-def-123',
        queryCustomerKey: 'QPP_Query_run-1',
        targetDeName: 'QPP_Results_run-',
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'poll-enqueued',
        runId: 'run-1',
        taskId: 'task-123',
      });
      expect(mockRunToTempFlow.execute).toHaveBeenCalledWith(job.data, expect.any(Function));
      expect(mockQueue.add).toHaveBeenCalledWith(
        'poll-shell-query',
        expect.objectContaining({
          runId: 'run-1',
          taskId: 'task-123',
          queryDefinitionId: 'query-def-123',
          pollCount: 0,
        }),
        expect.objectContaining({
          jobId: 'poll-run-1',
        }),
      );
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle flow execution failure', async () => {
      const job = createMockBullJob({ runId: 'run-1', tenantId: 't1', userId: 'u1', mid: 'm1' });

      mockRunToTempFlow.execute.mockRejectedValue(new Error('MCE Down'));

      await expect(processor.process(job as any)).rejects.toThrow('MCE Down');
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('handlePoll', () => {
    it('should complete when status is Complete', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Complete' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValue({});

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'completed', runId: 'run-1' });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should handle case-insensitive status check', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: '  COMPLETE  ' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValue({});

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'completed', runId: 'run-1' });
    });

    it('should fail when ErrorMsg is present', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Error' },
                  { Name: 'ErrorMsg', Value: 'Syntax error in query' },
                ],
              },
            },
          },
        },
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'failed',
        runId: 'run-1',
        error: 'Syntax error in query',
      });
    });

    it('should continue polling when status is Processing', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        pollCount: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Processing' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({ pollCount: 1 }),
      );
    });

    it('should stop polling when job is canceled', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
      });

      mockDb.setSelectResult([{ status: 'canceled' }]);

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'canceled', runId: 'run-1' });
      // Cleanup is now handled through QueryDefinitionService (mocked via stub)
      // The stub's deleteByCustomerKey returns true without making actual SOAP calls
    });

    it('should timeout after max duration', async () => {
      const oldTimestamp = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        pollStartedAt: oldTimestamp,
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'timeout', runId: 'run-1' });
    });

    it('should fail when poll budget exceeded', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        pollCount: 120,
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'budget-exceeded', runId: 'run-1' });
    });
  });

  describe('REST isRunning check and confirmations', () => {
    it('should track first not-running detection when CompletedDate is present (without waiting for stuck threshold)', async () => {
      const pollStartedAt = new Date(Date.now() - 6 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        queryDefinitionId: 'query-def-123',
        pollStartedAt,
        notRunningConfirmations: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                  { Name: 'CompletedDate', Value: '1/16/2026 10:54:35 AM' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValue({ isRunning: false });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          notRunningConfirmations: 1,
          notRunningDetectedAt: expect.any(String),
        }),
      );
    });

    it('should track first not-running detection after stuck threshold', async () => {
      const stuckTimestamp = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        queryDefinitionId: 'query-def-123',
        pollStartedAt: stuckTimestamp,
        notRunningConfirmations: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValue({ isRunning: false });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          notRunningConfirmations: 1,
          notRunningDetectedAt: expect.any(String),
        }),
      );
    });

    it('should proceed to rowset check after required confirmations', async () => {
      const stuckTimestamp = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const firstDetection = new Date(Date.now() - 20 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        queryDefinitionId: 'query-def-123',
        pollStartedAt: stuckTimestamp,
        notRunningDetectedAt: firstDetection,
        notRunningConfirmations: 1,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request
        .mockResolvedValueOnce({ isRunning: false })
        .mockResolvedValueOnce({});

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'completed', runId: 'run-1' });
    });

    it('should reset confirmations when isRunning becomes true', async () => {
      const stuckTimestamp = new Date(Date.now() - 4 * 60 * 1000).toISOString();
      const firstDetection = new Date(Date.now() - 10 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        queryDefinitionId: 'query-def-123',
        pollStartedAt: stuckTimestamp,
        notRunningDetectedAt: firstDetection,
        notRunningConfirmations: 1,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValue({ isRunning: true });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          notRunningConfirmations: 0,
          notRunningDetectedAt: undefined,
        }),
      );
    });
  });

  describe('Row probe fast-path', () => {
    it('should mark ready immediately when row probe finds rows (fast-path)', async () => {
      const pollStartedAt = new Date(Date.now() - 6 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: 'QPP_Results_test',
        pollStartedAt,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValueOnce({ count: 1, items: [{ SubscriberKey: 'test' }] });

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'completed', runId: 'run-1' });
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should continue polling when row probe returns empty rows', async () => {
      const pollStartedAt = new Date(Date.now() - 6 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: 'QPP_Results_test',
        pollStartedAt,
        pollCount: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockResolvedValueOnce({ count: 0, items: [] });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({
          rowProbeAttempts: 1,
          rowProbeLastCheckedAt: expect.any(String),
        }),
      );
    });

    it('should fail immediately when row probe returns 401 (missing credentials)', async () => {
      const pollStartedAt = new Date(Date.now() - 6 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: 'QPP_Results_test',
        pollStartedAt,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockRejectedValueOnce({ status: 401, message: 'No credentials found' });

      await expect(processor.process(job as any)).rejects.toThrow(
        'No credentials found for tenant t1 MID m1',
      );
      expect(mockDb.update).toHaveBeenCalled();
    });

    it('should skip row probe when elapsed time is below minimum runtime', async () => {
      const pollStartedAt = new Date(Date.now() - 2 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: 'QPP_Results_test',
        pollStartedAt,
        pollCount: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(mockMceBridge.request).not.toHaveBeenCalled();
      expect(job.updateData).toHaveBeenCalledWith(
        expect.not.objectContaining({
          rowProbeAttempts: expect.any(Number),
        }),
      );
    });

    it('should skip row probe when interval has not elapsed since last probe', async () => {
      const pollStartedAt = new Date(Date.now() - 10 * 1000).toISOString();
      const rowProbeLastCheckedAt = new Date(Date.now() - 5 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: 'QPP_Results_test',
        pollStartedAt,
        pollCount: 0,
        rowProbeAttempts: 1,
        rowProbeLastCheckedAt,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(mockMceBridge.request).not.toHaveBeenCalled();
    });

    it('should skip row probe when targetDeName is not set', async () => {
      const pollStartedAt = new Date(Date.now() - 6 * 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: '',
        pollStartedAt,
        pollCount: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Queued' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      const result = await processor.process(job as any);

      expect(result).toEqual({
        status: 'polling',
        runId: 'run-1',
        pollCount: 1,
      });
      expect(mockMceBridge.request).not.toHaveBeenCalled();
    });
  });

  describe('Rowset readiness', () => {
    it('should fail after max rowset ready attempts', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        targetDeName: 'QPP_Results_test',
        rowsetReadyAttempts: 5,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Complete' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockRejectedValue({ status: 404 });

      const result = await processor.process(job as any);

      expect(result).toEqual({ status: 'rowset-not-queryable', runId: 'run-1' });
    });

    it('should fail immediately when rowset readiness check hits 401 (missing credentials)', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        targetDeName: 'QPP_Results_test',
        rowsetReadyAttempts: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Complete' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockRejectedValue({ status: 401, message: 'No credentials found' });

      await expect(processor.process(job as any)).rejects.toThrow(
        'No credentials found for tenant t1 MID m1',
      );
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('BullMQ scheduling (non-test mode)', () => {
    it('uses moveToDelayed and throws DelayedError when continuing to poll', async () => {
      processor.setTestMode(false);
      const now = 1_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const pollStartedAt = new Date(now - 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        queryCustomerKey: '',
        targetDeName: '',
        pollStartedAt,
        pollCount: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Processing' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      await expect(processor.process(job as any, 'token')).rejects.toBeInstanceOf(
        DelayedError,
      );

      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({ pollCount: 1 }),
      );
      expect(job.moveToDelayed).toHaveBeenCalledWith(now + 3200, 'token');
    });

    it('uses moveToDelayed and throws DelayedError when rowset is not ready yet', async () => {
      processor.setTestMode(false);
      const now = 1_000_000;
      vi.spyOn(Date, 'now').mockReturnValue(now);
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const pollStartedAt = new Date(now - 1000).toISOString();
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
        targetDeName: 'QPP_Results_test',
        pollStartedAt,
        pollCount: 0,
        rowsetReadyAttempts: 0,
      });

      mockMceBridge.soapRequest.mockResolvedValue({
        Body: {
          RetrieveResponseMsg: {
            Results: {
              Properties: {
                Property: [
                  { Name: 'Status', Value: 'Complete' },
                  { Name: 'ErrorMsg', Value: '' },
                ],
              },
            },
          },
        },
      });

      mockMceBridge.request.mockRejectedValue({ status: 404 });

      await expect(processor.process(job as any, 'token')).rejects.toBeInstanceOf(
        DelayedError,
      );
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({ rowsetReadyAttempts: 1 }),
      );
      expect(job.moveToDelayed).toHaveBeenCalledWith(now + 2400, 'token');
    });
  });
});
