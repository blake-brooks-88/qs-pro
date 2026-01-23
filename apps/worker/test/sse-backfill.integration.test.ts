import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AsyncStatusService,
  EncryptionService,
  MceBridgeService,
  RestDataService,
  RlsContextService,
} from '@qpp/backend-shared';
import {
  createAsyncStatusServiceStub,
  createDbStub,
  createEncryptionServiceStub,
  createMceBridgeStub,
  createMetricsStub,
  createMockBullJob,
  createMockPollBullJob,
  createQueueStub,
  createRedisStub,
  createRestDataServiceStub,
  createRlsContextStub,
  resetFactories,
} from '@qpp/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';

// Helper to decrypt Redis event data (stub uses 'encrypted:' prefix)
function decryptEventData(encrypted: string): unknown {
  const decrypted = encrypted.startsWith('encrypted:') ? encrypted.slice(10) : encrypted;
  return JSON.parse(decrypted);
}

describe('ShellQueryProcessor SSE Backfill', () => {
  let processor: ShellQueryProcessor;
  let mockRedis: ReturnType<typeof createRedisStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockRestDataService: ReturnType<typeof createRestDataServiceStub>;
  let mockAsyncStatusService: ReturnType<typeof createAsyncStatusServiceStub>;
  let mockRunToTempFlow: {
    execute: ReturnType<typeof vi.fn>;
    retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn>;
  };
  let mockQueue: ReturnType<typeof createQueueStub>;

  beforeEach(async () => {
    resetFactories();
    const mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
    mockRestDataService = createRestDataServiceStub();
    mockAsyncStatusService = createAsyncStatusServiceStub();
    mockRunToTempFlow = {
      execute: vi.fn(),
      retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue(null),
    };
    mockQueue = createQueueStub();
    mockRedis = createRedisStub();
    const mockMetrics = createMetricsStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryProcessor,
        { provide: RunToTempFlow, useValue: mockRunToTempFlow },
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: RestDataService, useValue: mockRestDataService },
        { provide: AsyncStatusService, useValue: mockAsyncStatusService },
        { provide: EncryptionService, useValue: createEncryptionServiceStub() },
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

  describe('Event persistence for reconnect backfill', () => {
    it('persists status event to Redis with 24h TTL when publishing', async () => {
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

      await processor.process(job as any);

      expect(mockRedis.set).toHaveBeenCalled();
      const setCalls = mockRedis.set.mock.calls;
      const lastEventSetCall = setCalls.find(
        (call: [string, string, string, number]) =>
          call[0] === 'run-status:last:run-1',
      );
      expect(lastEventSetCall).toBeDefined();
      expect(lastEventSetCall?.[2]).toBe('EX');
      expect(lastEventSetCall?.[3]).toBe(86400);
    });

    it('persists terminal ready state to Redis', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
      });

      mockAsyncStatusService.retrieve.mockResolvedValue({
        status: 'Complete',
        errorMsg: '',
      });

      mockRestDataService.getRowset.mockResolvedValue({ count: 0, items: [] });

      await processor.process(job as any);

      const setCalls = mockRedis.set.mock.calls;
      const readyEventCall = setCalls.find(
        (call: [string, string, string, number]) => {
          if (call[0] !== 'run-status:last:run-1') return false;
          const eventData = decryptEventData(call[1]) as { status: string };
          return eventData.status === 'ready';
        },
      );
      expect(readyEventCall).toBeDefined();
    });

    it('persists terminal failed state with error message to Redis', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
        taskId: 'task-123',
      });

      mockAsyncStatusService.retrieve.mockResolvedValue({
        status: 'Error',
        errorMsg: 'Syntax error in query',
      });

      await processor.process(job as any);

      const setCalls = mockRedis.set.mock.calls;
      const failedEventCall = setCalls.find(
        (call: [string, string, string, number]) => {
          if (call[0] !== 'run-status:last:run-1') return false;
          const eventData = decryptEventData(call[1]) as { status: string };
          return eventData.status === 'failed';
        },
      );
      expect(failedEventCall).toBeDefined();
      const eventData = decryptEventData(failedEventCall?.[1] as string) as { errorMessage: string };
      expect(eventData.errorMessage).toBe('Syntax error in query');
    });

    it('persists canceled state to Redis', async () => {
      const job = createMockPollBullJob({
        runId: 'run-1',
        tenantId: 't1',
        userId: 'u1',
        mid: 'm1',
      });

      const mockDb = createDbStub();
      mockDb.setSelectResult([{ status: 'canceled' }]);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ShellQueryProcessor,
          { provide: RunToTempFlow, useValue: mockRunToTempFlow },
          { provide: MceBridgeService, useValue: mockMceBridge },
          { provide: RestDataService, useValue: createRestDataServiceStub() },
          { provide: AsyncStatusService, useValue: createAsyncStatusServiceStub() },
          { provide: EncryptionService, useValue: createEncryptionServiceStub() },
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

      const processorWithCanceled = module.get<ShellQueryProcessor>(
        ShellQueryProcessor,
      );
      processorWithCanceled.setTestMode(true);

      await processorWithCanceled.process(job as any);

      const setCalls = mockRedis.set.mock.calls;
      const canceledEventCall = setCalls.find(
        (call: [string, string, string, number]) => {
          if (call[0] !== 'run-status:last:run-1') return false;
          const eventData = decryptEventData(call[1]) as { status: string };
          return eventData.status === 'canceled';
        },
      );
      expect(canceledEventCall).toBeDefined();
    });

    it('publishes to channel and persists in parallel', async () => {
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

      await processor.process(job as any);

      const publishCalls = mockRedis.publish.mock.calls.filter(
        (call: [string, string]) => call[0] === 'run-status:run-1',
      );
      const setCalls = mockRedis.set.mock.calls.filter(
        (call: [string, string, string, number]) =>
          call[0] === 'run-status:last:run-1',
      );

      expect(publishCalls.length).toBeGreaterThan(0);
      expect(setCalls.length).toBeGreaterThan(0);
      expect(publishCalls.length).toBe(setCalls.length);
    });
  });
});
