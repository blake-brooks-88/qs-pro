import { Test, TestingModule } from '@nestjs/testing';
import { RunToTempFlow } from '../src/shell-query/strategies/run-to-temp.strategy';
import { MceQueryValidator } from '../src/shell-query/mce-query-validator';
import {
  DataExtensionService,
  DataFolderService,
  QueryDefinitionService,
  RlsContextService,
} from '@qpp/backend-shared';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockJob } from './factories';
import { createDbStub, createRlsContextStub } from './stubs';

describe('RunToTempFlow', () => {
  let strategy: RunToTempFlow;
  let mockDb: ReturnType<typeof createDbStub>;
  let mockQueryValidator: { validateQuery: ReturnType<typeof vi.fn> };
  let mockDataExtensionService: {
    retrieveFields: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let mockDataFolderService: {
    retrieve: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let mockQueryDefinitionService: {
    retrieve: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    perform: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockDb = createDbStub();
    mockQueryValidator = {
      validateQuery: vi.fn().mockResolvedValue({ valid: true }),
    };
    mockDataExtensionService = {
      retrieveFields: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ objectId: 'mock-de-object-id' }),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    mockDataFolderService = {
      retrieve: vi.fn().mockResolvedValue([{ id: 123, name: 'QueryPlusPlus Results' }]),
      create: vi.fn().mockResolvedValue({ id: 456 }),
    };
    mockQueryDefinitionService = {
      retrieve: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ objectId: 'mock-qd-object-id' }),
      perform: vi.fn().mockResolvedValue({ taskId: 'mock-task-id' }),
      delete: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunToTempFlow,
        { provide: MceQueryValidator, useValue: mockQueryValidator },
        { provide: RlsContextService, useValue: createRlsContextStub() },
        { provide: 'DATABASE', useValue: mockDb },
        { provide: DataExtensionService, useValue: mockDataExtensionService },
        { provide: DataFolderService, useValue: mockDataFolderService },
        { provide: QueryDefinitionService, useValue: mockQueryDefinitionService },
      ],
    }).compile();

    strategy = module.get<RunToTempFlow>(RunToTempFlow);
  });

  it('should execute full flow: folder -> DE -> Query -> Perform', async () => {
    const job = createMockJob();

    mockDb.setSelectResult([]);

    mockDataFolderService.retrieve
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 100, name: 'Data Extensions' }]);

    mockDataFolderService.create.mockResolvedValue({ id: 999 });

    mockDataExtensionService.create.mockResolvedValue({ objectId: 'obj-de-123' });

    mockQueryDefinitionService.retrieve.mockResolvedValue(null);
    mockQueryDefinitionService.create.mockResolvedValue({ objectId: 'obj-qd-123' });
    mockQueryDefinitionService.perform.mockResolvedValue({ taskId: 'task-abc' });

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

    mockDataExtensionService.create.mockResolvedValue({ objectId: 'obj-de-456' });

    mockQueryDefinitionService.retrieve.mockResolvedValue(null);
    mockQueryDefinitionService.create.mockResolvedValue({ objectId: 'obj-qd-456' });
    mockQueryDefinitionService.perform.mockResolvedValue({ taskId: 'task-xyz' });

    const result = await strategy.execute(job);

    expect(result.taskId).toBe('task-xyz');
    expect(result.queryDefinitionId).toBe('obj-qd-456');
    expect(mockDataFolderService.retrieve).not.toHaveBeenCalled();
  });

  it('should throw on QueryDefinition creation failure', async () => {
    const job = createMockJob();
    mockDb.setSelectResult([{ qppFolderId: 123 }]);

    mockDataExtensionService.create.mockResolvedValue({ objectId: 'obj-de-789' });

    mockQueryDefinitionService.retrieve.mockResolvedValue(null);
    mockQueryDefinitionService.create.mockRejectedValue(new Error('Invalid SQL'));

    await expect(strategy.execute(job)).rejects.toThrow('Invalid SQL');
  });

  it('should stop execution when query validation fails', async () => {
    const job = createMockJob();
    mockQueryValidator.validateQuery.mockResolvedValue({
      valid: false,
      errors: ['Invalid syntax near SELECT'],
    });

    await expect(strategy.execute(job)).rejects.toThrow('Invalid syntax near SELECT');
    expect(mockDataExtensionService.create).not.toHaveBeenCalled();
    expect(mockDataFolderService.retrieve).not.toHaveBeenCalled();
    expect(mockQueryDefinitionService.create).not.toHaveBeenCalled();
  });
});
