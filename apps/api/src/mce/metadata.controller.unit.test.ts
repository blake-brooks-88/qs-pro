import { Test, TestingModule } from '@nestjs/testing';
import { MetadataService } from '@qpp/backend-shared';
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

  describe('getFolders', () => {
    it('returns folders with expected structure', async () => {
      // Arrange
      const mockResult = [
        { id: '1', Name: 'Data Extensions', ParentFolder: { ID: '0' } },
        { id: '2', Name: 'Shared', ParentFolder: { ID: '0' } },
      ];
      mockService.getFolders.mockResolvedValue(mockResult);

      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };

      // Act
      const result = await controller.getFolders(user, 'eid1');

      // Assert - observable behavior: returns array of folders with expected shape
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: '1', Name: 'Data Extensions' }),
          expect.objectContaining({ id: '2', Name: 'Shared' }),
        ]),
      );
    });

    it('returns empty array when no folders exist', async () => {
      // Arrange
      mockService.getFolders.mockResolvedValue([]);
      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };

      // Act
      const result = await controller.getFolders(user, 'eid1');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getDataExtensions', () => {
    it('returns data extensions with expected structure', async () => {
      // Arrange
      const mockResult = [
        { CustomerKey: 'DE1', Name: 'My_Data_Extension' },
        { CustomerKey: 'DE2', Name: 'Another_DE' },
      ];
      mockService.getDataExtensions.mockResolvedValue(mockResult);

      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };

      // Act
      const result = await controller.getDataExtensions(user, 'eid1');

      // Assert - observable behavior: returns array of DEs with CustomerKey and Name
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            CustomerKey: 'DE1',
            Name: 'My_Data_Extension',
          }),
          expect.objectContaining({ CustomerKey: 'DE2', Name: 'Another_DE' }),
        ]),
      );
    });

    it('returns empty array when no data extensions exist', async () => {
      // Arrange
      mockService.getDataExtensions.mockResolvedValue([]);
      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };

      // Act
      const result = await controller.getDataExtensions(user, 'eid1');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('getFields', () => {
    it('returns fields for a DE with expected structure', async () => {
      // Arrange
      const mockResult = [
        { Name: 'SubscriberKey', FieldType: 'Text', MaxLength: 254 },
        { Name: 'EmailAddress', FieldType: 'EmailAddress' },
        { Name: 'CreatedDate', FieldType: 'Date' },
      ];
      mockService.getFields.mockResolvedValue(mockResult);

      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };

      // Act
      const result = await controller.getFields(user, 'DE_KEY');

      // Assert - observable behavior: returns array of fields with Name and type info
      expect(result).toHaveLength(3);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ Name: 'SubscriberKey', FieldType: 'Text' }),
          expect.objectContaining({
            Name: 'EmailAddress',
            FieldType: 'EmailAddress',
          }),
          expect.objectContaining({ Name: 'CreatedDate', FieldType: 'Date' }),
        ]),
      );
    });

    it('returns empty array when DE has no fields', async () => {
      // Arrange
      mockService.getFields.mockResolvedValue([]);
      const user = { userId: 'u1', tenantId: 't1', mid: 'mid1' };

      // Act
      const result = await controller.getFields(user, 'EMPTY_DE');

      // Assert
      expect(result).toEqual([]);
    });
  });
});
