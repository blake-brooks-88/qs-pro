import { Test, TestingModule } from '@nestjs/testing';
import {
  DataExtensionService,
  ErrorCode,
  MetadataService,
  QueryDefinitionService,
} from '@qpp/backend-shared';
import type { CreateQueryActivityDto } from '@qpp/shared-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SavedQueriesService } from '../../saved-queries/saved-queries.service';
import { QueryActivitiesService } from '../query-activities.service';

describe('QueryActivitiesService', () => {
  let service: QueryActivitiesService;
  let dataExtensionService: DataExtensionService;
  let queryDefinitionService: QueryDefinitionService;
  let metadataService: MetadataService;
  let savedQueriesService: SavedQueriesService;

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
            retrieveAll: vi.fn().mockResolvedValue([]),
            retrieveDetail: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ objectId: 'created-obj-id' }),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            getFields: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SavedQueriesService,
          useValue: {
            findAllLinkedQaKeys: vi
              .fn()
              .mockResolvedValue(new Map<string, string | null>()),
            linkToQA: vi.fn().mockResolvedValue({
              id: 'sq-1',
              name: 'My Query',
              sqlText: 'SELECT 1',
              folderId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              linkedQaObjectId: 'qa-obj-1',
              linkedQaCustomerKey: 'qa-key-1',
              linkedQaName: 'QA One',
              linkedAt: new Date(),
            }),
            unlinkFromQA: vi.fn().mockResolvedValue({
              id: 'sq-1',
              name: 'My Query',
              sqlText: 'SELECT 1',
              folderId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              linkedQaObjectId: null,
              linkedQaCustomerKey: null,
              linkedQaName: null,
              linkedAt: null,
            }),
            update: vi.fn().mockResolvedValue({
              id: 'sq-1',
              name: 'My Query',
              sqlText: 'SELECT 1',
              folderId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              linkedQaObjectId: null,
              linkedQaCustomerKey: null,
              linkedQaName: null,
              linkedAt: null,
            }),
            updateSqlAndLink: vi.fn().mockResolvedValue({
              id: 'sq-1',
              name: 'My Query',
              sqlText: 'SELECT Remote FROM [DE]',
              folderId: null,
              createdAt: new Date(),
              updatedAt: new Date(),
              linkedQaObjectId: 'qa-obj-1',
              linkedQaCustomerKey: 'qa-key-1',
              linkedQaName: 'QA One',
              linkedAt: new Date(),
            }),
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
    savedQueriesService = module.get<SavedQueriesService>(SavedQueriesService);
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
      expect(result).toEqual({
        objectId: 'created-obj-id',
        customerKey: expect.any(String),
      });
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
      expect(result).toEqual({
        objectId: 'created-obj-id',
        customerKey: expect.any(String),
      });
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

  describe('listAllWithLinkStatus', () => {
    it('returns QA list with link status merged from saved queries', async () => {
      // Arrange
      vi.mocked(queryDefinitionService.retrieveAll).mockResolvedValue([
        {
          objectId: 'qa-obj-1',
          customerKey: 'qa-key-1',
          name: 'QA One',
          targetUpdateType: 'Overwrite',
        },
        {
          objectId: 'qa-obj-2',
          customerKey: 'qa-key-2',
          name: 'QA Two',
          targetUpdateType: 'Append',
        },
      ]);
      const linkedMap = new Map<string, string | null>([
        ['qa-key-1', 'My Saved Query'],
      ]);
      vi.mocked(savedQueriesService.findAllLinkedQaKeys).mockResolvedValue(
        linkedMap,
      );

      // Act
      const result = await service.listAllWithLinkStatus(
        mockTenantId,
        mockUserId,
        mockMid,
      );

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        customerKey: 'qa-key-1',
        isLinked: true,
        linkedToQueryName: 'My Saved Query',
      });
      expect(result[1]).toMatchObject({
        customerKey: 'qa-key-2',
        isLinked: false,
        linkedToQueryName: null,
      });
    });
  });

  describe('getDetail', () => {
    it('returns QA detail with link status', async () => {
      // Arrange
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        queryText: 'SELECT * FROM [DE]',
        targetUpdateType: 'Overwrite',
        targetDEName: 'Target DE',
        targetDECustomerKey: 'de-key-1',
      });
      vi.mocked(savedQueriesService.findAllLinkedQaKeys).mockResolvedValue(
        new Map<string, string | null>([['qa-key-1', 'My Query']]),
      );

      // Act
      const result = await service.getDetail(
        mockTenantId,
        mockUserId,
        mockMid,
        'qa-key-1',
      );

      // Assert
      expect(result).toMatchObject({
        customerKey: 'qa-key-1',
        queryText: 'SELECT * FROM [DE]',
        isLinked: true,
        linkedToQueryName: 'My Query',
      });
    });

    it('throws RESOURCE_NOT_FOUND when QA does not exist', async () => {
      // Arrange
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getDetail(mockTenantId, mockUserId, mockMid, 'nonexistent'),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('linkQuery', () => {
    it('links saved query to QA and returns link response', async () => {
      // Arrange
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        queryText: 'SELECT * FROM [DE]',
      });

      // Act
      const result = await service.linkQuery(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
        'qa-key-1',
      );

      // Assert
      expect(result).toMatchObject({
        linkedQaObjectId: 'qa-obj-1',
        linkedQaCustomerKey: 'qa-key-1',
        linkedQaName: 'QA One',
        sqlUpdated: false,
      });
      expect(savedQueriesService.updateSqlAndLink).not.toHaveBeenCalled();
    });

    it('calls updateSqlAndLink atomically when conflict resolution is keep-remote', async () => {
      // Arrange
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-1',
        customerKey: 'qa-key-1',
        name: 'QA One',
        queryText: 'SELECT Remote FROM [DE]',
      });

      // Act
      const result = await service.linkQuery(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
        'qa-key-1',
        'keep-remote',
      );

      // Assert
      expect(result.sqlUpdated).toBe(true);
      expect(savedQueriesService.updateSqlAndLink).toHaveBeenCalledWith(
        mockTenantId,
        mockMid,
        mockUserId,
        'sq-1',
        'SELECT Remote FROM [DE]',
        {
          linkedQaObjectId: 'qa-obj-1',
          linkedQaCustomerKey: 'qa-key-1',
          linkedQaName: 'QA One',
        },
      );
      expect(savedQueriesService.linkToQA).not.toHaveBeenCalled();
    });

    it('throws RESOURCE_NOT_FOUND when QA does not exist', async () => {
      // Arrange
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.linkQuery(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
          'nonexistent',
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('unlinkQuery', () => {
    it('unlinks saved query and returns success', async () => {
      // Act
      const result = await service.unlinkQuery(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      // Assert
      expect(result).toEqual({ success: true });
      expect(savedQueriesService.unlinkFromQA).toHaveBeenCalledWith(
        mockTenantId,
        mockMid,
        mockUserId,
        'sq-1',
      );
    });
  });
});
