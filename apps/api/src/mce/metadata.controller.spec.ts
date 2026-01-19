import { Test, TestingModule } from '@nestjs/testing';
import { MetadataService } from '@qs-pro/backend-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MetadataController } from './metadata.controller';

describe('MetadataController', () => {
  let controller: MetadataController;

  const mockService = {
    getFolders: vi.fn(),
    getDataExtensions: vi.fn(),
    getFields: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetadataController],
      providers: [
        {
          provide: MetadataService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<MetadataController>(MetadataController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFolders', () => {
    it('should return folders', async () => {
      const mockResult = [{ id: '1', Name: 'Folder' }];
      mockService.getFolders.mockResolvedValue(mockResult);

      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };
      const result = await controller.getFolders(user, 'eid1');

      expect(result).toBe(mockResult);
      expect(mockService.getFolders).toHaveBeenCalledWith(
        't1',
        'u1',
        'mid1',
        'eid1',
      );
    });
  });

  describe('getDataExtensions', () => {
    it('should return data extensions', async () => {
      const mockResult = [{ CustomerKey: 'DE1' }];
      mockService.getDataExtensions.mockResolvedValue(mockResult);

      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };
      const result = await controller.getDataExtensions(user, 'eid1');

      expect(result).toBe(mockResult);
      expect(mockService.getDataExtensions).toHaveBeenCalledWith(
        't1',
        'u1',
        'mid1',
        'eid1',
      );
    });
  });

  describe('getFields', () => {
    it('should return fields for a DE', async () => {
      const mockResult = [{ Name: 'Field1' }];
      mockService.getFields.mockResolvedValue(mockResult);

      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };
      const result = await controller.getFields(user, 'DE_KEY');

      expect(result).toBe(mockResult);
      expect(mockService.getFields).toHaveBeenCalledWith(
        't1',
        'u1',
        'mid1',
        'DE_KEY',
      );
    });
  });
});
