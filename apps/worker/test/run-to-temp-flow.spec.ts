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

    mockDb.setSelectResult([]);

    mockMceBridge.soapRequest
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: [] } } })
      .mockResolvedValueOnce({
        Body: {
          RetrieveResponseMsg: {
            Results: { ID: '100' },
          },
        },
      })
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: 'OK',
              NewID: '999',
            },
          },
        },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: 'OK',
              NewObjectID: 'obj-de-123',
            },
          },
        },
      })
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: [] } } })
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: 'OK',
              NewObjectID: 'obj-qd-123',
              NewID: 'qd-id-123',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: 'OK',
                Task: {
                  ID: 'task-abc',
                },
              },
            },
          },
        },
      });

    const result = await strategy.execute(job);

    expect(result.taskId).toBe('task-abc');
    expect(result.queryDefinitionId).toBe('obj-qd-123');
    expect(result.queryCustomerKey).toContain('QPP_Query_');
    expect(result.targetDeName).toContain('QPP_');
    expect(mockQueryValidator.validateQuery).toHaveBeenCalled();
  });

  it('should use cached folder ID when available', async () => {
    const job = createMockJob();

    mockDb.setSelectResult([{ qppFolderId: 123 }]);

    mockMceBridge.soapRequest
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: 'OK',
              NewObjectID: 'obj-de-456',
            },
          },
        },
      })
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: [] } } })
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: 'OK',
              NewObjectID: 'obj-qd-456',
              NewID: 'qd-id-456',
            },
          },
        },
      })
      .mockResolvedValueOnce({
        Body: {
          PerformResponseMsg: {
            Results: {
              Result: {
                StatusCode: 'OK',
                Task: {
                  ID: 'task-xyz',
                },
              },
            },
          },
        },
      });

    const result = await strategy.execute(job);

    expect(result.taskId).toBe('task-xyz');
    expect(result.queryDefinitionId).toBe('obj-qd-456');
  });

  it('should throw on QueryDefinition creation failure', async () => {
    const job = createMockJob();
    mockDb.setSelectResult([{ qppFolderId: 123 }]);

    mockMceBridge.soapRequest
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: {
              StatusCode: 'OK',
              NewObjectID: 'obj-de-789',
            },
          },
        },
      })
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: [] } } })
      .mockResolvedValueOnce({
        Body: {
          CreateResponse: {
            Results: { StatusCode: 'Error', StatusMessage: 'Invalid SQL' },
          },
        },
      });

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
