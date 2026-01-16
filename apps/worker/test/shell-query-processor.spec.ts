import { Test, TestingModule } from '@nestjs/testing';
import { ShellQueryProcessor } from '../src/shell-query/shell-query.processor';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { RlsContextService, MceBridgeService } from '@qs-pro/backend-shared';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMockBullJob } from './factories';
import { createDbStub, createMceBridgeStub, createRedisStub, createMetricsStub, createRlsContextStub } from './stubs';

describe('ShellQueryProcessor', () => {
  let processor: ShellQueryProcessor;
  let mockDb: ReturnType<typeof createDbStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockRunToTempFlow: { execute: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
    mockRunToTempFlow = { execute: vi.fn() };
    const mockRedis = createRedisStub();
    const mockMetrics = createMetricsStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShellQueryProcessor,
        { provide: RunToTempFlow, useValue: mockRunToTempFlow },
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: RlsContextService, useValue: createRlsContextStub() },
        { provide: 'DATABASE', useValue: mockDb },
        { provide: 'REDIS_CLIENT', useValue: mockRedis },
        { provide: 'METRICS_JOBS_TOTAL', useValue: mockMetrics },
        { provide: 'METRICS_DURATION', useValue: mockMetrics },
        { provide: 'METRICS_FAILURES_TOTAL', useValue: mockMetrics },
        { provide: 'METRICS_ACTIVE_JOBS', useValue: mockMetrics },
      ],
    }).compile();

    processor = module.get<ShellQueryProcessor>(ShellQueryProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should process job and poll until complete', async () => {
    const job = createMockBullJob({
      runId: 'run-1',
      tenantId: 't1',
      userId: 'u1',
      mid: 'm1',
      eid: 'e1',
      sqlText: 'SELECT 1',
    });

    mockRunToTempFlow.execute.mockResolvedValue({ taskId: 'task-123' });

    // Mock polling response: first 'Processing', then 'Complete'
    mockMceBridge.soapRequest
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: { Status: 'Processing' } } } })
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: { Status: 'Complete' } } } });

    const result = await processor.process(job as any);

    expect(result.status).toBe('completed');
    expect(mockRunToTempFlow.execute).toHaveBeenCalledWith(job.data, expect.any(Function));
    expect(mockMceBridge.soapRequest).toHaveBeenCalledWith(
      't1', 'u1', 'm1', expect.stringContaining('AsyncActivityStatus'), 'Retrieve'
    );
    expect(mockDb.update).toHaveBeenCalled();
  });

  it('should handle query failure status', async () => {
    const job = createMockBullJob({ runId: 'run-1', tenantId: 't1', userId: 'u1', mid: 'm1' });

    mockRunToTempFlow.execute.mockResolvedValue({ taskId: 'task-123' });
    mockMceBridge.soapRequest.mockResolvedValue({
      Body: { RetrieveResponseMsg: { Results: { Status: 'Error', ErrorMsg: 'Syntax error' } } }
    });

    await expect(processor.process(job as any)).rejects.toThrow('Syntax error');
    expect(mockDb.update).toHaveBeenCalledWith(expect.objectContaining({})); // Verify fail status was set
  });

  it('should handle flow execution failure', async () => {
    const job = createMockBullJob({ runId: 'run-1', tenantId: 't1', userId: 'u1', mid: 'm1' });

    mockRunToTempFlow.execute.mockRejectedValue(new Error('MCE Down'));

    await expect(processor.process(job as any)).rejects.toThrow('MCE Down');
    expect(mockDb.update).toHaveBeenCalled();
  });
});
