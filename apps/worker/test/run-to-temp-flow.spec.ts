import { Test, TestingModule } from '@nestjs/testing';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { MceQueryValidator } from '../src/shell-query/mce-query-validator';
import { QueryDefinitionService } from '../src/shell-query/query-definition.service';
import { MceBridgeService, RlsContextService } from '@qs-pro/backend-shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockJob } from './factories';
import { createDbStub, createMceBridgeStub, createRlsContextStub, createQueryDefinitionServiceStub } from './stubs';

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
        { provide: QueryDefinitionService, useValue: createQueryDefinitionServiceStub() },
        { provide: RlsContextService, useValue: createRlsContextStub() },
        { provide: 'DATABASE', useValue: mockDb },
      ],
    }).compile();

    strategy = module.get<RunToTempFlow>(RunToTempFlow);
  });

  it('should execute full flow: folder -> DE -> Query -> Perform', async () => {
    const job = createMockJob();

    mockDb.setSelectResult([]);

    // Note: deleteQueryDefinitionIfExists now uses QueryDefinitionService (stub)
    // so no Retrieve call is made for it
    mockMceBridge.soapRequest
      // 1. ensureQppFolder: check if folder exists
      .mockResolvedValueOnce({ Body: { RetrieveResponseMsg: { Results: [] } } })
      // 2. ensureQppFolder: get root folder ID
      .mockResolvedValueOnce({
        Body: {
          RetrieveResponseMsg: {
            Results: { ID: '100' },
          },
        },
      })
      // 3. ensureQppFolder: create folder
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
      // 4. upsert settings (empty response)
      .mockResolvedValueOnce({})
      // 5. ensureDataExtension: create DE
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
      // 6. createQueryDefinition: create query
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
      // 7. performQuery: start execution
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

    // Note: deleteQueryDefinitionIfExists now uses QueryDefinitionService (stub)
    mockMceBridge.soapRequest
      // 1. upsert settings (uses cached folder ID)
      .mockResolvedValueOnce({})
      // 2. ensureDataExtension: create DE
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
      // 3. createQueryDefinition: create query
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
      // 4. performQuery: start execution
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

    // Note: deleteQueryDefinitionIfExists now uses QueryDefinitionService (stub)
    mockMceBridge.soapRequest
      // 1. upsert settings (uses cached folder ID)
      .mockResolvedValueOnce({})
      // 2. ensureDataExtension: create DE
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
      // 3. createQueryDefinition: fails with error
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
