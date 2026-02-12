import * as crypto from 'node:crypto';

import { Test, TestingModule } from '@nestjs/testing';
import {
  DataExtensionService,
  ErrorCode,
  MceBridgeService,
  MetadataService,
  QueryDefinitionService,
  RlsContextService,
} from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SavedQueriesService } from '../../saved-queries/saved-queries.service';
import { QueryActivitiesService } from '../query-activities.service';
import type { QueryPublishEventsRepository } from '../query-publish-events.repository';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

describe('QueryActivitiesService (publish)', () => {
  let service: QueryActivitiesService;
  let savedQueriesService: SavedQueriesService;
  let mceBridgeService: MceBridgeService;
  let queryDefinitionService: QueryDefinitionService;
  let publishEventRepo: QueryPublishEventsRepository;

  const mockTenantId = 'tenant-pub-1';
  const mockUserId = 'user-pub-1';
  const mockMid = '99001';

  const mockSavedQueryLinked = {
    id: 'sq-1',
    name: 'My Query',
    sqlText: 'SELECT 1',
    folderId: null,
    createdAt: new Date('2026-02-01'),
    updatedAt: new Date('2026-02-01'),
    linkedQaObjectId: 'qa-obj-100',
    linkedQaCustomerKey: 'qa-key-100',
    linkedQaName: 'QA One',
    linkedAt: new Date('2026-02-01'),
  };

  const mockSavedQueryUnlinked = {
    ...mockSavedQueryLinked,
    linkedQaObjectId: null,
    linkedQaCustomerKey: null,
    linkedQaName: null,
    linkedAt: null,
  };

  const mockVersionSql = {
    sqlText: 'SELECT Name FROM [Subscribers]',
    sqlTextHash: sha256('SELECT Name FROM [Subscribers]'),
  };

  const mockPublishEvent = {
    id: 'pe-1',
    savedQueryId: 'sq-1',
    versionId: 'v-1',
    tenantId: mockTenantId,
    mid: mockMid,
    userId: mockUserId,
    linkedQaCustomerKey: 'qa-key-100',
    publishedSqlHash: sha256('SELECT Name FROM [Subscribers]'),
    createdAt: new Date('2026-02-10T12:00:00Z'),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryActivitiesService,
        {
          provide: DataExtensionService,
          useValue: {
            retrieveByCustomerKey: vi.fn(),
          },
        },
        {
          provide: QueryDefinitionService,
          useValue: {
            retrieveAll: vi.fn(),
            retrieveDetail: vi.fn(),
            retrieveByNameAndFolder: vi.fn(),
            retrieve: vi.fn(),
            create: vi.fn(),
          },
        },
        {
          provide: MetadataService,
          useValue: {
            getFields: vi.fn(),
          },
        },
        {
          provide: MceBridgeService,
          useValue: {
            request: vi.fn().mockResolvedValue({}),
          },
        },
        {
          provide: RlsContextService,
          useValue: {
            runWithUserContext: vi
              .fn()
              .mockImplementation(
                (_t: string, _m: string, _u: string, fn: () => unknown) => fn(),
              ),
          },
        },
        {
          provide: 'QUERY_PUBLISH_EVENT_REPOSITORY',
          useValue: {
            create: vi.fn().mockResolvedValue(mockPublishEvent),
            findLatestBySavedQueryId: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: SavedQueriesService,
          useValue: {
            findById: vi.fn().mockResolvedValue(mockSavedQueryLinked),
            getVersionSql: vi.fn().mockResolvedValue(mockVersionSql),
            getLatestVersionSql: vi.fn().mockResolvedValue({
              versionId: 'v-1',
              ...mockVersionSql,
            }),
            findAllLinkedQaKeys: vi
              .fn()
              .mockResolvedValue(new Map<string, string | null>()),
          },
        },
      ],
    }).compile();

    service = module.get(QueryActivitiesService);
    savedQueriesService = module.get(SavedQueriesService);
    mceBridgeService = module.get(MceBridgeService);
    queryDefinitionService = module.get(QueryDefinitionService);
    publishEventRepo = module.get('QUERY_PUBLISH_EVENT_REPOSITORY');
  });

  describe('publish', () => {
    it('calls MCE PATCH before creating publish event (MCE-first ordering)', async () => {
      const callOrder: string[] = [];
      vi.mocked(mceBridgeService.request).mockImplementation(async () => {
        callOrder.push('mce');
        return {};
      });
      vi.mocked(publishEventRepo.create).mockImplementation(async (params) => {
        callOrder.push('repo');
        return { ...mockPublishEvent, ...params } as any;
      });

      await service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-1');

      expect(callOrder).toEqual(['mce', 'repo']);
    });

    it('returns PublishQueryResponse with correct shape', async () => {
      const result = await service.publish(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
        'v-1',
      );

      expect(result).toEqual({
        publishEventId: mockPublishEvent.id,
        versionId: mockPublishEvent.versionId,
        savedQueryId: mockPublishEvent.savedQueryId,
        publishedSqlHash: mockPublishEvent.publishedSqlHash,
        publishedAt: mockPublishEvent.createdAt.toISOString(),
      });
    });

    it('computes SHA-256 hash of the SQL text', async () => {
      const expectedHash = sha256(mockVersionSql.sqlText);

      await service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-1');

      expect(publishEventRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          publishedSqlHash: expectedHash,
        }),
      );
    });

    it('throws RESOURCE_NOT_FOUND when saved query is not linked', async () => {
      vi.mocked(savedQueriesService.findById).mockResolvedValue(
        mockSavedQueryUnlinked,
      );

      await expect(
        service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('throws RESOURCE_NOT_FOUND when version does not exist', async () => {
      vi.mocked(savedQueriesService.getVersionSql).mockResolvedValue(null);

      await expect(
        service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-bad'),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('does NOT call publishEventRepo.create when MCE PATCH throws', async () => {
      vi.mocked(mceBridgeService.request).mockRejectedValue(
        new Error('MCE 500'),
      );

      await expect(
        service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-1'),
      ).rejects.toThrow('MCE 500');

      expect(publishEventRepo.create).not.toHaveBeenCalled();
    });

    it('propagates MCE error when MCE PATCH fails', async () => {
      const mceError = new Error('MCE Gateway Timeout');
      vi.mocked(mceBridgeService.request).mockRejectedValue(mceError);

      await expect(
        service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-1'),
      ).rejects.toThrow('MCE Gateway Timeout');
    });

    it('passes correct args to publishEventRepo.create', async () => {
      await service.publish(mockTenantId, mockUserId, mockMid, 'sq-1', 'v-1');

      expect(publishEventRepo.create).toHaveBeenCalledWith({
        savedQueryId: 'sq-1',
        versionId: 'v-1',
        tenantId: mockTenantId,
        mid: mockMid,
        userId: mockUserId,
        linkedQaCustomerKey: 'qa-key-100',
        publishedSqlHash: sha256(mockVersionSql.sqlText),
      });
    });
  });

  describe('checkDrift', () => {
    it('returns hasDrift: false when local SQL hash matches remote SQL hash', async () => {
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-100',
        customerKey: 'qa-key-100',
        name: 'QA One',
        queryText: mockVersionSql.sqlText,
        targetUpdateType: 'Overwrite',
      });

      const result = await service.checkDrift(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.hasDrift).toBe(false);
    });

    it('returns hasDrift: true when local SQL hash differs from remote SQL hash', async () => {
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-100',
        customerKey: 'qa-key-100',
        name: 'QA One',
        queryText: 'SELECT DIFFERENT FROM [Table]',
        targetUpdateType: 'Overwrite',
      });

      const result = await service.checkDrift(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.hasDrift).toBe(true);
    });

    it('returns both localSql and remoteSql in the response', async () => {
      const remoteSql = 'SELECT Remote FROM [Table]';
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-100',
        customerKey: 'qa-key-100',
        name: 'QA One',
        queryText: remoteSql,
        targetUpdateType: 'Overwrite',
      });

      const result = await service.checkDrift(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.localSql).toBe(mockVersionSql.sqlText);
      expect(result.remoteSql).toBe(remoteSql);
    });

    it('returns localHash and remoteHash in the response', async () => {
      const remoteSql = 'SELECT Other FROM [DE]';
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-100',
        customerKey: 'qa-key-100',
        name: 'QA One',
        queryText: remoteSql,
        targetUpdateType: 'Overwrite',
      });

      const result = await service.checkDrift(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.localHash).toBe(sha256(mockVersionSql.sqlText));
      expect(result.remoteHash).toBe(sha256(remoteSql));
    });

    it('throws RESOURCE_NOT_FOUND when saved query is not linked', async () => {
      vi.mocked(savedQueriesService.findById).mockResolvedValue(
        mockSavedQueryUnlinked,
      );

      await expect(
        service.checkDrift(mockTenantId, mockUserId, mockMid, 'sq-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('handles case where no local versions exist', async () => {
      vi.mocked(savedQueriesService.getLatestVersionSql).mockResolvedValue(
        null,
      );
      vi.mocked(queryDefinitionService.retrieveDetail).mockResolvedValue({
        objectId: 'qa-obj-100',
        customerKey: 'qa-key-100',
        name: 'QA One',
        queryText: 'SELECT 1',
        targetUpdateType: 'Overwrite',
      });

      const result = await service.checkDrift(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.localSql).toBe('');
      expect(result.hasDrift).toBe(true);
    });
  });

  describe('getBlastRadius', () => {
    const makeAutomation = (
      id: string,
      name: string,
      status: number,
      qaObjectId: string,
      objectTypeId = 300,
    ) => ({
      id,
      name,
      status,
      steps: [
        {
          stepNumber: 1,
          activities: [
            {
              id: `act-${id}`,
              name: `Activity ${id}`,
              objectTypeId,
              activityObjectId: qaObjectId,
            },
          ],
        },
      ],
    });

    it('returns automations that contain the linked QA (objectTypeId 300)', async () => {
      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: [
          makeAutomation('auto-1', 'Daily Export', 2, 'qa-obj-100'),
          makeAutomation('auto-2', 'Weekly Sync', 3, 'qa-obj-999'),
        ],
        totalResults: 2,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(1);
      expect(result.automations[0]).toMatchObject({
        id: 'auto-1',
        name: 'Daily Export',
      });
    });

    it('returns empty automations array when no automations contain the QA', async () => {
      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: [makeAutomation('auto-1', 'Unrelated', 2, 'qa-obj-other')],
        totalResults: 1,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    it('marks statuses 3 (Running), 6 (Scheduled), 7 (Awaiting Trigger) as isHighRisk: true', async () => {
      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: [
          makeAutomation('auto-running', 'Running Auto', 3, 'qa-obj-100'),
          makeAutomation('auto-sched', 'Scheduled Auto', 6, 'qa-obj-100'),
          makeAutomation('auto-trigger', 'Trigger Auto', 7, 'qa-obj-100'),
        ],
        totalResults: 3,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(3);
      for (const auto of result.automations) {
        expect(auto.isHighRisk).toBe(true);
      }
    });

    it('marks other statuses as isHighRisk: false', async () => {
      const nonHighRiskStatuses = [0, 1, 2, 4, 5, 8, -1];
      const items = nonHighRiskStatuses.map((s, i) =>
        makeAutomation(`auto-${i}`, `Auto ${s}`, s, 'qa-obj-100'),
      );

      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: items,
        totalResults: items.length,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(nonHighRiskStatuses.length);
      for (const auto of result.automations) {
        expect(auto.isHighRisk).toBe(false);
      }
    });

    it('maps status codes to human-readable strings', async () => {
      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: [
          makeAutomation('a1', 'Running', 3, 'qa-obj-100'),
          makeAutomation('a2', 'Ready', 2, 'qa-obj-100'),
          makeAutomation('a3', 'Scheduled', 6, 'qa-obj-100'),
          makeAutomation('a4', 'Error', -1, 'qa-obj-100'),
          makeAutomation('a5', 'Awaiting', 7, 'qa-obj-100'),
        ],
        totalResults: 5,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      const statusMap = new Map(
        result.automations.map((a) => [a.id, a.status]),
      );
      expect(statusMap.get('a1')).toBe('Running');
      expect(statusMap.get('a2')).toBe('Ready');
      expect(statusMap.get('a3')).toBe('Scheduled');
      expect(statusMap.get('a4')).toBe('Error');
      expect(statusMap.get('a5')).toBe('Awaiting Trigger');
    });

    it('handles pagination when first page count exceeds pageSize', async () => {
      vi.mocked(mceBridgeService.request)
        .mockResolvedValueOnce({
          entry: [makeAutomation('auto-p1', 'Page 1 Auto', 2, 'qa-obj-100')],
          totalResults: 300,
        })
        .mockResolvedValueOnce({
          entry: [makeAutomation('auto-p2', 'Page 2 Auto', 3, 'qa-obj-100')],
          totalResults: 300,
        });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(mceBridgeService.request).toHaveBeenCalledTimes(2);
      expect(result.automations).toHaveLength(2);
      expect(result.automations[0]?.name).toBe('Page 1 Auto');
      expect(result.automations[1]?.name).toBe('Page 2 Auto');
    });

    it('throws RESOURCE_NOT_FOUND when saved query is not linked', async () => {
      vi.mocked(savedQueriesService.findById).mockResolvedValue(
        mockSavedQueryUnlinked,
      );

      await expect(
        service.getBlastRadius(mockTenantId, mockUserId, mockMid, 'sq-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('returns totalCount matching the number of matching automations', async () => {
      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: [
          makeAutomation('auto-1', 'Match 1', 2, 'qa-obj-100'),
          makeAutomation('auto-2', 'No Match', 2, 'qa-obj-other'),
          makeAutomation('auto-3', 'Match 2', 5, 'qa-obj-100'),
        ],
        totalResults: 3,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.totalCount).toBe(2);
      expect(result.automations).toHaveLength(2);
    });

    it('ignores activities with objectTypeId other than 300', async () => {
      vi.mocked(mceBridgeService.request).mockResolvedValue({
        entry: [
          makeAutomation('auto-1', 'Non-QA Activity', 2, 'qa-obj-100', 42),
        ],
        totalResults: 1,
      });

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(0);
    });
  });
});
