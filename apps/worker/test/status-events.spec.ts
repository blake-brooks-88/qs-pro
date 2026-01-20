import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { RlsContextService, MceBridgeService, AsyncStatusService, RestDataService } from '@qpp/backend-shared';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockBullJob, createMockPollBullJob } from './factories';
import { createDbStub, createMceBridgeStub, createRedisStub, createMetricsStub, createRlsContextStub, createQueueStub, createAsyncStatusServiceStub, createRestDataServiceStub } from './stubs';
import { RunStatus, STATUS_MESSAGES } from '../src/shell-query/shell-query.types';

describe('Status Event Flow', () => {
  let processor: ShellQueryProcessor;
  let mockDb: ReturnType<typeof createDbStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockRestDataService: ReturnType<typeof createRestDataServiceStub>;
  let mockAsyncStatusService: ReturnType<typeof createAsyncStatusServiceStub>;
  let mockRedis: ReturnType<typeof createRedisStub>;
  let mockRunToTempFlow: { execute: ReturnType<typeof vi.fn>; retrieveQueryDefinitionObjectId: ReturnType<typeof vi.fn> };
  let mockQueue: ReturnType<typeof createQueueStub>;
  let publishedEvents: Array<{ channel: string; payload: unknown }>;

  beforeEach(async () => {
    mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
    mockRestDataService = createRestDataServiceStub();
    mockAsyncStatusService = createAsyncStatusServiceStub();
    mockRedis = createRedisStub();
    mockRunToTempFlow = {
      execute: vi.fn(),
      retrieveQueryDefinitionObjectId: vi.fn().mockResolvedValue(null),
    };
    mockQueue = createQueueStub();
    const mockMetrics = createMetricsStub();
    publishedEvents = [];

    mockRedis.publish = vi.fn().mockImplementation((channel: string, message: string) => {
      publishedEvents.push({ channel, payload: JSON.parse(message) });
      return Promise.resolve();
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryProcessor,
        { provide: RunToTempFlow, useValue: mockRunToTempFlow },
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: RestDataService, useValue: mockRestDataService },
        { provide: AsyncStatusService, useValue: mockAsyncStatusService },
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

  it('should progress through all status stages in correct order', async () => {
    const job = createMockBullJob({
      runId: 'run-status-test',
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
      eid: 'e1',
      sqlText: 'SELECT 1',
    });

    const capturedStatuses: RunStatus[] = [];

    mockRunToTempFlow.execute.mockImplementation(async (_job, publishStatus) => {
      await publishStatus('validating_query');
      capturedStatuses.push('validating_query');
      await publishStatus('creating_data_extension');
      capturedStatuses.push('creating_data_extension');
      await publishStatus('executing_query');
      capturedStatuses.push('executing_query');
      return { taskId: 'task-123', queryDefinitionId: 'query-def-123' };
    });

    await processor.process(job as unknown as Parameters<typeof processor.process>[0]);

    const publishedStatuses = publishedEvents.map((e) => e.payload).map((p: unknown) => (p as { status: string }).status);

    expect(publishedStatuses).toContain('queued');
    expect(publishedStatuses).toContain('validating_query');
    expect(publishedStatuses).toContain('creating_data_extension');
    expect(publishedStatuses).toContain('executing_query');

    const queuedIdx = publishedStatuses.indexOf('queued');
    const validatingIdx = publishedStatuses.indexOf('validating_query');
    const creatingIdx = publishedStatuses.indexOf('creating_data_extension');
    const executingIdx = publishedStatuses.indexOf('executing_query');

    expect(queuedIdx).toBeLessThan(validatingIdx);
    expect(validatingIdx).toBeLessThan(creatingIdx);
    expect(creatingIdx).toBeLessThan(executingIdx);

    expect(mockQueue.add).toHaveBeenCalledWith(
      'poll-shell-query',
      expect.objectContaining({ runId: 'run-status-test', taskId: 'task-123' }),
      expect.anything(),
    );
  });

  it('should include human-readable message with each status event', async () => {
    const job = createMockBullJob({
      runId: 'run-message-test',
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
      eid: 'e1',
      sqlText: 'SELECT 1',
    });

    mockRunToTempFlow.execute.mockImplementation(async (_job, publishStatus) => {
      await publishStatus('validating_query');
      await publishStatus('creating_data_extension');
      await publishStatus('executing_query');
      return { taskId: 'task-456', queryDefinitionId: 'query-def-456' };
    });

    await processor.process(job as unknown as Parameters<typeof processor.process>[0]);

    for (const event of publishedEvents) {
      const payload = event.payload as { status: RunStatus; message: string };
      expect(payload.message).toBeDefined();
      expect(typeof payload.message).toBe('string');
      expect(payload.message.length).toBeGreaterThan(0);
      expect(payload.message).toBe(STATUS_MESSAGES[payload.status]);
    }
  });

  it('should include timestamp and runId with each status event', async () => {
    const runId = 'run-metadata-test';
    const job = createMockBullJob({
      runId,
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
      eid: 'e1',
      sqlText: 'SELECT 1',
    });

    mockRunToTempFlow.execute.mockResolvedValue({
      taskId: 'task-789',
      queryDefinitionId: 'query-def-789',
    });

    await processor.process(job as unknown as Parameters<typeof processor.process>[0]);

    for (const event of publishedEvents) {
      const payload = event.payload as { status: string; timestamp: string; runId: string };
      expect(payload.runId).toBe(runId);
      expect(payload.timestamp).toBeDefined();
      expect(() => new Date(payload.timestamp)).not.toThrow();
      expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
    }
  });

  it('should include errorMessage in failed terminal state', async () => {
    const job = createMockBullJob({
      runId: 'run-error-test',
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
      eid: 'e1',
      sqlText: 'SELECT 1',
    });

    const errorMessage = 'MCE Query Execution Error: Invalid syntax';
    mockRunToTempFlow.execute.mockRejectedValue(new Error(errorMessage));

    await expect(
      processor.process(job as unknown as Parameters<typeof processor.process>[0]),
    ).rejects.toThrow();

    const failedEvent = publishedEvents.find(
      (e) => (e.payload as { status: string }).status === 'failed',
    );

    expect(failedEvent).toBeDefined();
    const payload = failedEvent?.payload as { status: string; errorMessage: string; message: string };
    expect(payload.errorMessage).toBe(errorMessage);
    expect(payload.message).toContain('failed');
  });

  it('should emit canceled status when run is canceled during polling', async () => {
    const job = createMockPollBullJob({
      runId: 'run-cancel-test',
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
    });

    mockDb.setSelectResult([{ status: 'canceled' }]);

    const result = await processor.process(job as unknown as Parameters<typeof processor.process>[0]);

    expect(result).toEqual({ status: 'canceled', runId: 'run-cancel-test' });

    const canceledEvent = publishedEvents.find(
      (e) => (e.payload as { status: string }).status === 'canceled',
    );

    expect(canceledEvent).toBeDefined();
    const payload = canceledEvent?.payload as { status: string; message: string };
    expect(payload.message).toBe(STATUS_MESSAGES.canceled);
  });

  it('should emit fetching_results and ready statuses when poll job completes', async () => {
    const job = createMockPollBullJob({
      runId: 'run-complete-test',
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
      taskId: 'task-123',
    });

    mockAsyncStatusService.retrieve.mockResolvedValue({
      status: 'Complete',
      errorMsg: '',
    });

    await processor.process(job as unknown as Parameters<typeof processor.process>[0]);

    const publishedStatuses = publishedEvents.map((e) => (e.payload as { status: string }).status);

    expect(publishedStatuses).toContain('fetching_results');
    expect(publishedStatuses).toContain('ready');

    const fetchingIdx = publishedStatuses.indexOf('fetching_results');
    const readyIdx = publishedStatuses.indexOf('ready');
    expect(fetchingIdx).toBeLessThan(readyIdx);
  });
});
