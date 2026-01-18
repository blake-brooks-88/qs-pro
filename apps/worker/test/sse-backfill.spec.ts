import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { QueryDefinitionService } from '../src/shell-query/query-definition.service';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { RlsContextService, MceBridgeService } from '@qs-pro/backend-shared';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockBullJob, createMockPollBullJob } from './factories';
import {
  createDbStub,
  createMceBridgeStub,
  createRedisStub,
  createMetricsStub,
  createRlsContextStub,
  createQueueStub,
  createQueryDefinitionServiceStub,
} from './stubs';

describe('ShellQueryProcessor SSE Backfill', () => {
  let processor: ShellQueryProcessor;
  let mockRedis: ReturnType<typeof createRedisStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockRunToTempFlow: {
    execute: ReturnType<typeof vi.fn>;
    retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn>;
  };
  let mockQueue: ReturnType<typeof createQueueStub>;

  beforeEach(async () => {
    const mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
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

  describe('Event persistence for reconnect backfill', () => {
    it('persists status event to Redis with 24h TTL when publishing', async () => {
      // Arrange
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

      // Act
      await processor.process(job as any);

      // Assert - verify set was called with EX flag for TTL
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
      // Arrange
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

      // Act
      await processor.process(job as any);

      // Assert - verify ready event was persisted
      const setCalls = mockRedis.set.mock.calls;
      const readyEventCall = setCalls.find(
        (call: [string, string, string, number]) => {
          if (call[0] !== 'run-status:last:run-1') return false;
          const eventData = JSON.parse(call[1]);
          return eventData.status === 'ready';
        },
      );
      expect(readyEventCall).toBeDefined();
    });

    it('persists terminal failed state with error message to Redis', async () => {
      // Arrange
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

      // Act
      await processor.process(job as any);

      // Assert - verify failed event was persisted with error message
      const setCalls = mockRedis.set.mock.calls;
      const failedEventCall = setCalls.find(
        (call: [string, string, string, number]) => {
          if (call[0] !== 'run-status:last:run-1') return false;
          const eventData = JSON.parse(call[1]);
          return eventData.status === 'failed';
        },
      );
      expect(failedEventCall).toBeDefined();
      const eventData = JSON.parse(failedEventCall?.[1]);
      expect(eventData.errorMessage).toBe('Syntax error in query');
    });

    it('persists canceled state to Redis', async () => {
      // Arrange
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
          { provide: QueryDefinitionService, useValue: createQueryDefinitionServiceStub() },
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

      // Act
      await processorWithCanceled.process(job as any);

      // Assert - verify canceled event was persisted
      const setCalls = mockRedis.set.mock.calls;
      const canceledEventCall = setCalls.find(
        (call: [string, string, string, number]) => {
          if (call[0] !== 'run-status:last:run-1') return false;
          const eventData = JSON.parse(call[1]);
          return eventData.status === 'canceled';
        },
      );
      expect(canceledEventCall).toBeDefined();
    });

    it('publishes to channel and persists in parallel', async () => {
      // Arrange
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

      // Act
      await processor.process(job as any);

      // Assert - both publish and set should be called for each status event
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
