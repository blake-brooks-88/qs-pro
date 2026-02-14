import { Test, type TestingModule } from '@nestjs/testing';
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
import { QueryVersionsService } from '../query-versions.service';

const TENANT_ID = 'tenant-1';
const MID = 'mid-1';
const USER_ID = 'user-1';
const SAVED_QUERY_ID = 'sq-1';
const VERSION_ID = 'ver-1';

function createMockQueryVersion(overrides?: Record<string, unknown>) {
  return {
    id: VERSION_ID,
    savedQueryId: SAVED_QUERY_ID,
    tenantId: TENANT_ID,
    mid: MID,
    userId: USER_ID,
    sqlTextEncrypted: 'encrypted:SELECT 1',
    sqlTextHash: 'hash-abc',
    versionName: null,
    lineCount: 1,
    source: 'save',
    restoredFromId: null,
    createdAt: new Date('2026-01-15T10:30:00Z'),
    ...overrides,
  };
}

function createMockQueryVersionListItem(overrides?: Record<string, unknown>) {
  const version = createMockQueryVersion(overrides);
  return {
    id: version.id,
    savedQueryId: version.savedQueryId,
    tenantId: version.tenantId,
    mid: version.mid,
    userId: version.userId,
    sqlTextHash: version.sqlTextHash,
    versionName: version.versionName,
    lineCount: version.lineCount,
    source: version.source,
    restoredFromId: version.restoredFromId,
    createdAt: version.createdAt,
    authorName: null,
  };
}

function createQueryVersionsRepoStub() {
  return {
    create: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
    findBySavedQueryId: vi.fn().mockResolvedValue([]),
    findLatestBySavedQueryId: vi.fn().mockResolvedValue(null),
    updateName: vi.fn().mockResolvedValue(null),
  };
}

function createSavedQueriesRepoStub() {
  return {
    findById: vi.fn().mockResolvedValue({ id: SAVED_QUERY_ID }),
    update: vi.fn().mockResolvedValue(null),
  };
}

function createPublishEventsRepoStub() {
  return {
    create: vi.fn(),
    findLatestBySavedQueryId: vi.fn().mockResolvedValue(null),
    findBySavedQueryId: vi.fn().mockResolvedValue([]),
  };
}

function createFeaturesServiceStub() {
  return {
    getTenantFeatures: vi.fn().mockResolvedValue({
      features: { versionHistory: true, querySharing: true },
    }),
  };
}

describe('QueryVersionsService', () => {
  let service: QueryVersionsService;
  let versionsRepoStub: ReturnType<typeof createQueryVersionsRepoStub>;
  let savedQueriesRepoStub: ReturnType<typeof createSavedQueriesRepoStub>;
  let publishEventsRepoStub: ReturnType<typeof createPublishEventsRepoStub>;
  let encryptionStub: ReturnType<typeof createEncryptionServiceStub>;
  let featuresStub: ReturnType<typeof createFeaturesServiceStub>;

  beforeEach(async () => {
    resetFactories();

    versionsRepoStub = createQueryVersionsRepoStub();
    savedQueriesRepoStub = createSavedQueriesRepoStub();
    publishEventsRepoStub = createPublishEventsRepoStub();
    encryptionStub = createEncryptionServiceStub();
    featuresStub = createFeaturesServiceStub();

    const rlsStub = createRlsContextStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryVersionsService,
        {
          provide: 'QUERY_VERSIONS_REPOSITORY',
          useValue: versionsRepoStub,
        },
        {
          provide: 'SAVED_QUERIES_REPOSITORY',
          useValue: savedQueriesRepoStub,
        },
        {
          provide: 'QUERY_PUBLISH_EVENT_REPOSITORY',
          useValue: publishEventsRepoStub,
        },
        {
          provide: EncryptionService,
          useValue: encryptionStub,
        },
        {
          provide: RlsContextService,
          useValue: rlsStub,
        },
        {
          provide: FeaturesService,
          useValue: featuresStub,
        },
      ],
    }).compile();

    service = module.get(QueryVersionsService);
  });

  describe('listVersions()', () => {
    it('returns versions mapped to VersionListItem format', async () => {
      const listItem = createMockQueryVersionListItem();
      versionsRepoStub.findBySavedQueryId.mockResolvedValue([listItem]);

      const result = await service.listVersions(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
      );

      expect(result.total).toBe(1);
      expect(result.versions).toHaveLength(1);
      expect(result.versions[0]).toEqual({
        id: VERSION_ID,
        savedQueryId: SAVED_QUERY_ID,
        lineCount: 1,
        source: 'save',
        restoredFromId: null,
        versionName: null,
        createdAt: '2026-01-15T10:30:00.000Z',
        authorName: null,
      });
    });

    it('throws RESOURCE_NOT_FOUND when saved query does not exist', async () => {
      savedQueriesRepoStub.findById.mockResolvedValue(null);

      await expect(
        service.listVersions(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws FEATURE_NOT_ENABLED when feature is disabled', async () => {
      featuresStub.getTenantFeatures.mockResolvedValue({
        features: { versionHistory: false, querySharing: true },
      });

      await expect(
        service.listVersions(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });
  });

  describe('getVersionDetail()', () => {
    it('returns decrypted version detail', async () => {
      const version = createMockQueryVersion();
      versionsRepoStub.findById.mockResolvedValue(version);

      const result = await service.getVersionDetail(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
        VERSION_ID,
      );

      expect(result).toEqual({
        id: VERSION_ID,
        savedQueryId: SAVED_QUERY_ID,
        sqlText: 'SELECT 1',
        lineCount: 1,
        source: 'save',
        restoredFromId: null,
        versionName: null,
        createdAt: '2026-01-15T10:30:00.000Z',
      });
      expect(encryptionStub.decrypt).toHaveBeenCalledWith('encrypted:SELECT 1');
    });

    it('throws RESOURCE_NOT_FOUND when version does not belong to saved query', async () => {
      const version = createMockQueryVersion({
        savedQueryId: 'different-sq-id',
      });
      versionsRepoStub.findById.mockResolvedValue(version);

      await expect(
        service.getVersionDetail(
          TENANT_ID,
          MID,
          USER_ID,
          SAVED_QUERY_ID,
          VERSION_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws INTERNAL_ERROR when decryption fails', async () => {
      const version = createMockQueryVersion({
        sqlTextEncrypted: 'corrupted-data',
      });
      versionsRepoStub.findById.mockResolvedValue(version);
      encryptionStub.decrypt.mockReturnValue(null);

      await expect(
        service.getVersionDetail(
          TENANT_ID,
          MID,
          USER_ID,
          SAVED_QUERY_ID,
          VERSION_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.INTERNAL_ERROR,
      });
    });
  });

  describe('restore()', () => {
    it('creates a restore version record, updates saved query, and returns detail', async () => {
      const originalVersion = createMockQueryVersion();
      versionsRepoStub.findById.mockResolvedValue(originalVersion);

      const restoredVersion = createMockQueryVersion({
        id: 'ver-restored',
        source: 'restore',
        restoredFromId: VERSION_ID,
        versionName: 'Restored from Jan 15, 10:30 AM',
        createdAt: new Date('2026-01-16T12:00:00Z'),
      });
      versionsRepoStub.create.mockResolvedValue(restoredVersion);

      const result = await service.restore(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
        VERSION_ID,
      );

      expect(result.id).toBe('ver-restored');
      expect(result.source).toBe('restore');
      expect(result.restoredFromId).toBe(VERSION_ID);
      expect(result.sqlText).toBe('SELECT 1');
      expect(result.createdAt).toBe('2026-01-16T12:00:00.000Z');

      expect(versionsRepoStub.create).toHaveBeenCalledWith(
        expect.objectContaining({
          savedQueryId: SAVED_QUERY_ID,
          source: 'restore',
          restoredFromId: VERSION_ID,
          sqlTextEncrypted: originalVersion.sqlTextEncrypted,
          sqlTextHash: originalVersion.sqlTextHash,
          lineCount: originalVersion.lineCount,
        }),
      );
    });

    it('throws RESOURCE_NOT_FOUND when version does not belong to saved query', async () => {
      versionsRepoStub.findById.mockResolvedValue(null);

      await expect(
        service.restore(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID, VERSION_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('calls savedQueriesRepository.update with the version encrypted SQL', async () => {
      const originalVersion = createMockQueryVersion();
      versionsRepoStub.findById.mockResolvedValue(originalVersion);

      const restoredVersion = createMockQueryVersion({
        id: 'ver-restored',
        source: 'restore',
        restoredFromId: VERSION_ID,
      });
      versionsRepoStub.create.mockResolvedValue(restoredVersion);

      await service.restore(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
        VERSION_ID,
      );

      expect(savedQueriesRepoStub.update).toHaveBeenCalledWith(SAVED_QUERY_ID, {
        sqlTextEncrypted: originalVersion.sqlTextEncrypted,
      });
    });
  });

  describe('updateName()', () => {
    it('updates version name and returns list item format', async () => {
      const version = createMockQueryVersion();
      versionsRepoStub.findById.mockResolvedValue(version);

      const updatedVersion = createMockQueryVersion({
        versionName: 'My Important Save',
      });
      versionsRepoStub.updateName.mockResolvedValue(updatedVersion);

      const result = await service.updateName(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
        VERSION_ID,
        { versionName: 'My Important Save' },
      );

      expect(result).toEqual({
        id: VERSION_ID,
        savedQueryId: SAVED_QUERY_ID,
        lineCount: 1,
        source: 'save',
        restoredFromId: null,
        versionName: 'My Important Save',
        createdAt: '2026-01-15T10:30:00.000Z',
        authorName: null,
      });
      expect(versionsRepoStub.updateName).toHaveBeenCalledWith(
        VERSION_ID,
        'My Important Save',
      );
    });

    it('throws RESOURCE_NOT_FOUND when version does not belong to saved query', async () => {
      const version = createMockQueryVersion({
        savedQueryId: 'different-sq-id',
      });
      versionsRepoStub.findById.mockResolvedValue(version);

      await expect(
        service.updateName(
          TENANT_ID,
          MID,
          USER_ID,
          SAVED_QUERY_ID,
          VERSION_ID,
          {
            versionName: 'New Name',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });
  });

  describe('listPublishEvents()', () => {
    it('returns events mapped to PublishEventListItem format', async () => {
      // Arrange
      const rawEvent = {
        id: 'pe-1',
        savedQueryId: SAVED_QUERY_ID,
        versionId: VERSION_ID,
        tenantId: TENANT_ID,
        mid: MID,
        userId: USER_ID,
        linkedQaCustomerKey: 'qa-key-1',
        publishedSqlHash: 'hash-abc',
        createdAt: new Date('2026-02-10T12:00:00Z'),
      };
      publishEventsRepoStub.findBySavedQueryId.mockResolvedValue([rawEvent]);

      // Act
      const result = await service.listPublishEvents(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
      );

      // Assert
      expect(result.total).toBe(1);
      expect(result.events).toHaveLength(1);
      expect(result.events[0]).toEqual({
        id: 'pe-1',
        versionId: VERSION_ID,
        savedQueryId: SAVED_QUERY_ID,
        createdAt: '2026-02-10T12:00:00.000Z',
      });
    });

    it('returns empty events when no publish events exist', async () => {
      // Arrange
      publishEventsRepoStub.findBySavedQueryId.mockResolvedValue([]);

      // Act
      const result = await service.listPublishEvents(
        TENANT_ID,
        MID,
        USER_ID,
        SAVED_QUERY_ID,
      );

      // Assert
      expect(result.events).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('throws RESOURCE_NOT_FOUND when saved query does not exist', async () => {
      // Arrange
      savedQueriesRepoStub.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.listPublishEvents(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws FEATURE_NOT_ENABLED when versionHistory is disabled', async () => {
      // Arrange
      featuresStub.getTenantFeatures.mockResolvedValue({
        features: { versionHistory: false, querySharing: true },
      });

      // Act & Assert
      await expect(
        service.listPublishEvents(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('passes savedQueryId to the repository', async () => {
      // Arrange
      publishEventsRepoStub.findBySavedQueryId.mockResolvedValue([]);

      // Act
      await service.listPublishEvents(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID);

      // Assert
      expect(publishEventsRepoStub.findBySavedQueryId).toHaveBeenCalledWith(
        SAVED_QUERY_ID,
      );
    });
  });

  describe('feature gating', () => {
    beforeEach(() => {
      featuresStub.getTenantFeatures.mockResolvedValue({
        features: { versionHistory: false },
      });
    });

    it('listVersions throws FEATURE_NOT_ENABLED', async () => {
      await expect(
        service.listVersions(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('getVersionDetail throws FEATURE_NOT_ENABLED', async () => {
      await expect(
        service.getVersionDetail(
          TENANT_ID,
          MID,
          USER_ID,
          SAVED_QUERY_ID,
          VERSION_ID,
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('restore throws FEATURE_NOT_ENABLED', async () => {
      await expect(
        service.restore(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID, VERSION_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('updateName throws FEATURE_NOT_ENABLED', async () => {
      await expect(
        service.updateName(
          TENANT_ID,
          MID,
          USER_ID,
          SAVED_QUERY_ID,
          VERSION_ID,
          {
            versionName: 'Test',
          },
        ),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('listPublishEvents throws FEATURE_NOT_ENABLED', async () => {
      await expect(
        service.listPublishEvents(TENANT_ID, MID, USER_ID, SAVED_QUERY_ID),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });
  });
});
