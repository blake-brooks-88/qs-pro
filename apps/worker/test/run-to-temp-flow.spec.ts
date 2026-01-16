import { Test, TestingModule } from '@nestjs/testing';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { MceQueryValidator } from '../src/shell-query/mce-query-validator';
import { MceBridgeService, RlsContextService } from '@qs-pro/backend-shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockJob } from './factories';
import { createDbStub, createMceBridgeStub, createRlsContextStub } from './stubs';

describe('RunToTempFlow', () => {
  let strategy: RunToTempFlow;
  let mockDb: ReturnType<typeof createDbStub>;
  let mockMceBridge: ReturnType<typeof createMceBridgeStub>;
  let mockQueryValidator: { validateQuery: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockDb = createDbStub();
    mockMceBridge = createMceBridgeStub();
    mockQueryValidator = {
      validateQuery: vi.fn().mockResolvedValue({ valid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunToTempFlow,
        { provide: MceBridgeService, useValue: mockMceBridge },
        { provide: MceQueryValidator, useValue: mockQueryValidator },
        { provide: RlsContextService, useValue: createRlsContextStub() },
        { provide: 'DATABASE', useValue: mockDb },
      ],
    }).compile();

    strategy = module.get<RunToTempFlow>(RunToTempFlow);
  });

  it('should execute full flow: folder -> DE -> Query -> Perform', async () => {
    const job = createMockJob();

    // No cached folder
    mockDb.setSelectResult([]);

    // SOAP responses in sequence
    mockMceBridge.soapRequest
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: [] } } }) // folder search
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'OK', NewID: '999' } } } }) // folder create
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'OK' } } } }) // DE create
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'OK' } } } }) // Query create
      .mockResolvedValueOnce({ Body: { PerformResponseMsg: { Results: { Result: { StatusCode: 'OK', TaskID: 'task-abc' } } } } }); // Perform

    const result = await strategy.execute(job);

    expect(result.taskId).toBe('task-abc');
    expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(5);
    expect(mockQueryValidator.validateQuery).toHaveBeenCalled();
  });

  it('should use cached folder ID when available', async () => {
    const job = createMockJob();

    // Cached folder exists
    mockDb.setSelectResult([{ qppFolderId: 123 }]);

    mockMceBridge.soapRequest
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'OK' } } } }) // DE create
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'OK' } } } }) // Query create
      .mockResolvedValueOnce({ Body: { PerformResponseMsg: { Results: { Result: { StatusCode: 'OK', TaskID: 'task-xyz' } } } } }); // Perform

    const result = await strategy.execute(job);

    expect(result.taskId).toBe('task-xyz');
    // Should skip folder search/create - only 3 calls
    expect(mockMceBridge.soapRequest).toHaveBeenCalledTimes(3);
  });

  it('should throw on QueryDefinition creation failure', async () => {
    const job = createMockJob();
    mockDb.setSelectResult([{ qppFolderId: 123 }]);

    mockMceBridge.soapRequest
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'OK' } } } }) // DE
      .mockResolvedValueOnce({ Body: { CreateResponse: { Results: { StatusCode: 'Error', StatusMessage: 'Invalid SQL' } } } }); // Query fails

    await expect(strategy.execute(job)).rejects.toThrow('Invalid SQL');
  });

  it('should stop execution when query validation fails', async () => {
    const job = createMockJob();
    mockQueryValidator.validateQuery.mockResolvedValue({
      valid: false,
      errors: ['Invalid syntax near SELECT'],
    });

    await expect(strategy.execute(job)).rejects.toThrow('Invalid syntax near SELECT');
    expect(mockMceBridge.soapRequest).not.toHaveBeenCalled();
  });
});
