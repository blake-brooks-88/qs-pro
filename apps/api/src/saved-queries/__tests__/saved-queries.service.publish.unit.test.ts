import { Test, TestingModule } from '@nestjs/testing';
import {
  EncryptionService,
  ErrorCode,
  RlsContextService,
} from '@qpp/backend-shared';
import {
  createEncryptionServiceStub,
  createRlsContextStub,
  resetFactories,
} from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FeaturesService } from '../../features/features.service';
import { SavedQueriesService } from '../saved-queries.service';

describe('SavedQueriesService (version-SQL methods)', () => {
  let service: SavedQueriesService;
  let queryVersionsRepo: {
    create: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findBySavedQueryId: ReturnType<typeof vi.fn>;
    findLatestBySavedQueryId: ReturnType<typeof vi.fn>;
    updateName: ReturnType<typeof vi.fn>;
  };
  let encryptionStub: ReturnType<typeof createEncryptionServiceStub>;

  const tenantId = 'tenant-1';
  const mid = 'mid-1';
  const userId = 'user-1';
  const savedQueryId = 'sq-1';

  const mockVersion = {
    id: 'version-1',
    savedQueryId: 'sq-1',
    tenantId: 'tenant-1',
    mid: 'mid-1',
    userId: 'user-1',
    sqlTextEncrypted: 'encrypted:SELECT * FROM [TestDE]',
    sqlTextHash: 'abc123hash',
    lineCount: 1,
    source: 'save' as const,
    restoredFromId: null,
    versionName: null,
    createdAt: new Date('2026-02-10T12:00:00Z'),
  };

  beforeEach(async () => {
    resetFactories();

    encryptionStub = createEncryptionServiceStub();
    const rlsStub = createRlsContextStub();

    queryVersionsRepo = {
      create: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      findBySavedQueryId: vi.fn().mockResolvedValue([]),
      findLatestBySavedQueryId: vi.fn().mockResolvedValue(null),
      updateName: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedQueriesService,
        {
          provide: 'SAVED_QUERIES_REPOSITORY',
          useValue: {
            create: vi.fn(),
            findAll: vi.fn().mockResolvedValue([]),
            findAllListItems: vi.fn().mockResolvedValue([]),
            findById: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
            delete: vi.fn(),
            countByUser: vi.fn().mockResolvedValue(0),
            linkToQA: vi.fn(),
            unlinkFromQA: vi.fn(),
            findAllLinkedQaKeys: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: 'FOLDERS_REPOSITORY',
          useValue: {
            findById: vi.fn().mockResolvedValue(null),
            hasChildren: vi.fn().mockResolvedValue(false),
          },
        },
        {
          provide: 'QUERY_VERSIONS_REPOSITORY',
          useValue: queryVersionsRepo,
        },
        {
          provide: FeaturesService,
          useValue: {
            getTenantFeatures: vi.fn().mockResolvedValue({
              tier: 'pro',
              features: { querySharing: false },
            }),
          },
        },
        {
          provide: EncryptionService,
          useValue: encryptionStub,
        },
        {
          provide: RlsContextService,
          useValue: rlsStub,
        },
      ],
    }).compile();

    service = module.get<SavedQueriesService>(SavedQueriesService);
  });

  describe('getLatestVersionSql()', () => {
    it('returns versionId, sqlText, and sqlTextHash for the most recent version', async () => {
      // Arrange
      queryVersionsRepo.findLatestBySavedQueryId.mockResolvedValue(mockVersion);

      // Act
      const result = await service.getLatestVersionSql(
        tenantId,
        mid,
        userId,
        savedQueryId,
      );

      // Assert
      expect(result).toEqual({
        versionId: 'version-1',
        sqlText: 'SELECT * FROM [TestDE]',
        sqlTextHash: 'abc123hash',
      });
    });

    it('returns null when no versions exist', async () => {
      // Arrange
      queryVersionsRepo.findLatestBySavedQueryId.mockResolvedValue(null);

      // Act
      const result = await service.getLatestVersionSql(
        tenantId,
        mid,
        userId,
        savedQueryId,
      );

      // Assert
      expect(result).toBeNull();
    });

    it('decrypts sqlTextEncrypted via EncryptionService', async () => {
      // Arrange
      queryVersionsRepo.findLatestBySavedQueryId.mockResolvedValue(mockVersion);

      // Act
      await service.getLatestVersionSql(tenantId, mid, userId, savedQueryId);

      // Assert
      expect(encryptionStub.decrypt).toHaveBeenCalledWith(
        'encrypted:SELECT * FROM [TestDE]',
      );
    });

    it('calls findLatestBySavedQueryId with the correct savedQueryId', async () => {
      // Arrange
      queryVersionsRepo.findLatestBySavedQueryId.mockResolvedValue(null);

      // Act
      await service.getLatestVersionSql(tenantId, mid, userId, 'sq-custom');

      // Assert
      expect(queryVersionsRepo.findLatestBySavedQueryId).toHaveBeenCalledWith(
        'sq-custom',
      );
    });

    it('throws INTERNAL_ERROR when decryption returns null', async () => {
      // Arrange
      queryVersionsRepo.findLatestBySavedQueryId.mockResolvedValue({
        ...mockVersion,
        sqlTextEncrypted: 'corrupted-data',
      });
      encryptionStub.decrypt.mockReturnValue(null);

      // Act & Assert
      await expect(
        service.getLatestVersionSql(tenantId, mid, userId, savedQueryId),
      ).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      });
    });
  });

  describe('getVersionSql()', () => {
    it('returns sqlText and sqlTextHash for a valid versionId', async () => {
      // Arrange
      queryVersionsRepo.findById.mockResolvedValue(mockVersion);

      // Act
      const result = await service.getVersionSql(
        tenantId,
        mid,
        userId,
        savedQueryId,
        'version-1',
      );

      // Assert
      expect(result).toEqual({
        sqlText: 'SELECT * FROM [TestDE]',
        sqlTextHash: 'abc123hash',
      });
    });

    it('returns null when versionId does not exist', async () => {
      // Arrange
      queryVersionsRepo.findById.mockResolvedValue(null);

      // Act
      const result = await service.getVersionSql(
        tenantId,
        mid,
        userId,
        savedQueryId,
        'nonexistent',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when version belongs to a different savedQueryId', async () => {
      // Arrange
      queryVersionsRepo.findById.mockResolvedValue({
        ...mockVersion,
        savedQueryId: 'sq-other',
      });

      // Act
      const result = await service.getVersionSql(
        tenantId,
        mid,
        userId,
        savedQueryId,
        'version-1',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('decrypts sqlTextEncrypted via EncryptionService', async () => {
      // Arrange
      queryVersionsRepo.findById.mockResolvedValue(mockVersion);

      // Act
      await service.getVersionSql(
        tenantId,
        mid,
        userId,
        savedQueryId,
        'version-1',
      );

      // Assert
      expect(encryptionStub.decrypt).toHaveBeenCalledWith(
        'encrypted:SELECT * FROM [TestDE]',
      );
    });

    it('throws INTERNAL_ERROR when decryption returns undefined', async () => {
      // Arrange
      queryVersionsRepo.findById.mockResolvedValue({
        ...mockVersion,
        sqlTextEncrypted: 'corrupted-data',
      });
      encryptionStub.decrypt.mockReturnValue(undefined);

      // Act & Assert
      await expect(
        service.getVersionSql(tenantId, mid, userId, savedQueryId, 'version-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      });
    });
  });
});
