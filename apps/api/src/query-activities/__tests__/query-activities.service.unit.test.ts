import { Test, TestingModule } from '@nestjs/testing';
import {
  DataExtensionService,
  ErrorCode,
  MetadataService,
  QueryDefinitionService,
} from '@qpp/backend-shared';
import type { CreateQueryActivityDto } from '@qpp/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { QueryActivitiesService } from '../query-activities.service';

describe('QueryActivitiesService', () => {
  let service: QueryActivitiesService;
  let dataExtensionService: DataExtensionService;
  let queryDefinitionService: QueryDefinitionService;
  let metadataService: MetadataService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';
  const mockMid = '12345';

  const validDto: CreateQueryActivityDto = {
    name: 'Test Query Activity',
    targetDataExtensionCustomerKey: 'target-de-key',
    queryText: 'SELECT * FROM [TestDE]',
    targetUpdateType: 'Overwrite',
  };

  const mockTargetDE = {
    name: 'Target DE',
    customerKey: 'target-de-key',
    objectId: 'obj-789',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryActivitiesService,
        {
          provide: DataExtensionService,
          useValue: {
            retrieveByCustomerKey: vi.fn().mockResolvedValue(mockTargetDE),
          },
        },
        {
          provide: QueryDefinitionService,
          useValue: {
            retrieveByNameAndFolder: vi.fn().mockResolvedValue(null),
            retrieve: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ objectId: 'created-obj-id' }),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            getFields: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<QueryActivitiesService>(QueryActivitiesService);
    dataExtensionService =
      module.get<DataExtensionService>(DataExtensionService);
    queryDefinitionService = module.get<QueryDefinitionService>(
      QueryDefinitionService,
    );
    metadataService = module.get<MetadataService>(MetadataService);
  });

  describe('create', () => {
    it('creates Query Activity successfully with valid input', async () => {
      // Arrange - all mocks are set up with successful defaults

      // Act
      const result = await service.create(
        mockTenantId,
        mockUserId,
        mockMid,
        validDto,
      );

      // Assert
      expect(result).toEqual({ objectId: 'created-obj-id' });
      expect(queryDefinitionService.create).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        mockMid,
        expect.objectContaining({
          name: validDto.name,
          targetId: mockTargetDE.objectId,
          targetCustomerKey: mockTargetDE.customerKey,
          queryText: validDto.queryText,
          targetUpdateType: validDto.targetUpdateType,
        }),
      );
    });

    it('throws RESOURCE_NOT_FOUND when target DE does not exist', async () => {
      // Arrange
      vi.mocked(dataExtensionService.retrieveByCustomerKey).mockResolvedValue(
        null,
      );

      // Act & Assert
      await expect(
        service.create(mockTenantId, mockUserId, mockMid, validDto),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws VALIDATION_ERROR when Update mode selected but target DE has no Primary Key', async () => {
      // Arrange
      const updateDto: CreateQueryActivityDto = {
        ...validDto,
        targetUpdateType: 'Update',
      };
      vi.mocked(metadataService.getFields).mockResolvedValue([
        {
          Name: 'EmailAddress',
          FieldType: 'EmailAddress',
          IsPrimaryKey: false,
        },
        { Name: 'FirstName', FieldType: 'Text', IsPrimaryKey: false },
      ]);

      // Act & Assert
      await expect(
        service.create(mockTenantId, mockUserId, mockMid, updateDto),
      ).rejects.toMatchObject({
        code: ErrorCode.VALIDATION_ERROR,
      });
    });

    it('allows Update mode when target DE has a Primary Key', async () => {
      // Arrange
      const updateDto: CreateQueryActivityDto = {
        ...validDto,
        targetUpdateType: 'Update',
      };
      vi.mocked(metadataService.getFields).mockResolvedValue([
        { Name: 'SubscriberKey', FieldType: 'Text', IsPrimaryKey: true },
        { Name: 'FirstName', FieldType: 'Text', IsPrimaryKey: false },
      ]);

      // Act
      const result = await service.create(
        mockTenantId,
        mockUserId,
        mockMid,
        updateDto,
      );

      // Assert
      expect(result).toEqual({ objectId: 'created-obj-id' });
    });

    it('throws DUPLICATE_QUERY_ACTIVITY_NAME when name already exists in folder', async () => {
      // Arrange
      vi.mocked(
        queryDefinitionService.retrieveByNameAndFolder,
      ).mockResolvedValue({
        name: validDto.name,
        customerKey: 'existing-key',
        objectId: 'existing-obj',
      });

      // Act & Assert
      await expect(
        service.create(mockTenantId, mockUserId, mockMid, validDto),
      ).rejects.toMatchObject({
        code: ErrorCode.DUPLICATE_QUERY_ACTIVITY_NAME,
      });
    });

    it('throws DUPLICATE_CUSTOMER_KEY when customerKey already exists', async () => {
      // Arrange
      const dtoWithKey: CreateQueryActivityDto = {
        ...validDto,
        customerKey: 'my-custom-key',
      };
      vi.mocked(queryDefinitionService.retrieve).mockResolvedValue({
        name: 'Existing Activity',
        customerKey: 'my-custom-key',
        objectId: 'existing-obj',
      });

      // Act & Assert
      await expect(
        service.create(mockTenantId, mockUserId, mockMid, dtoWithKey),
      ).rejects.toMatchObject({
        code: ErrorCode.DUPLICATE_CUSTOMER_KEY,
      });
    });

    it('generates customerKey when not provided', async () => {
      // Arrange - no customerKey in DTO

      // Act
      await service.create(mockTenantId, mockUserId, mockMid, validDto);

      // Assert
      expect(queryDefinitionService.create).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        mockMid,
        expect.objectContaining({
          customerKey: expect.stringMatching(
            /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
          ),
        }),
      );
    });

    it('does not check customerKey uniqueness when auto-generating', async () => {
      // Arrange - no customerKey in DTO

      // Act
      await service.create(mockTenantId, mockUserId, mockMid, validDto);

      // Assert - retrieve should not be called when key is auto-generated
      expect(queryDefinitionService.retrieve).not.toHaveBeenCalled();
    });

    it('passes categoryId to create when provided', async () => {
      // Arrange
      const dtoWithFolder: CreateQueryActivityDto = {
        ...validDto,
        categoryId: 123,
      };

      // Act
      await service.create(mockTenantId, mockUserId, mockMid, dtoWithFolder);

      // Assert
      expect(queryDefinitionService.create).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        mockMid,
        expect.objectContaining({
          categoryId: 123,
        }),
      );
    });

    it('passes undefined categoryId to create for root folder', async () => {
      // Arrange - no categoryId in DTO

      // Act
      await service.create(mockTenantId, mockUserId, mockMid, validDto);

      // Assert
      expect(queryDefinitionService.create).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        mockMid,
        expect.objectContaining({
          categoryId: undefined,
        }),
      );
    });

    it('passes targetDataExtensionEid for shared DE lookup', async () => {
      // Arrange
      const dtoWithEid: CreateQueryActivityDto = {
        ...validDto,
        targetDataExtensionEid: 'enterprise-123',
      };

      // Act
      await service.create(mockTenantId, mockUserId, mockMid, dtoWithEid);

      // Assert
      expect(dataExtensionService.retrieveByCustomerKey).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        mockMid,
        validDto.targetDataExtensionCustomerKey,
        'enterprise-123',
      );
    });
  });
});
