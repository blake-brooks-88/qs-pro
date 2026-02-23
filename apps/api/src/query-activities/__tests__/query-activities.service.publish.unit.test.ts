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
    latestVersionHash: null,
    updatedByUserName: null,
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
    interface AutoDef {
      id: string;
      name: string;
      status: number;
      qaObjectId: string;
      objectTypeId?: number;
    }

    function setupBlastMock(
      automations: AutoDef[],
      opts?: { totalResults?: number },
    ) {
      const detailMap = new Map(
        automations.map((a) => [
          a.id,
          {
            id: a.id,
            name: a.name,
            status: a.status,
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: `act-${a.id}`,
                    name: `Activity ${a.id}`,
                    objectTypeId: a.objectTypeId ?? 300,
                    activityObjectId: a.qaObjectId,
                  },
                ],
              },
            ],
          },
        ]),
      );
      const listResponse = {
        items: automations.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
        })),
        count: opts?.totalResults ?? automations.length,
      };

      vi.mocked(mceBridgeService.request).mockImplementation(((
        _t: string,
        _u: string,
        _m: string,
        config: { url: string },
      ) => {
        if (config.url.includes('/automation/v1/automations?')) {
          return Promise.resolve(listResponse);
        }
        const id = config.url.split('/').pop() ?? '';
        const detail = detailMap.get(id);
        if (detail) {
          return Promise.resolve(detail);
        }
        return Promise.resolve({ id, name: '', status: 0, steps: [] });
      }) as any);
    }

    it('returns automations that contain the linked QA (objectTypeId 300)', async () => {
      setupBlastMock([
        {
          id: 'auto-1',
          name: 'Daily Export',
          status: 2,
          qaObjectId: 'qa-obj-100',
        },
        {
          id: 'auto-2',
          name: 'Weekly Sync',
          status: 3,
          qaObjectId: 'qa-obj-999',
        },
      ]);

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

    it('matches when activityObjectId equals linkedQaCustomerKey (not linkedQaObjectId)', async () => {
      vi.mocked(savedQueriesService.findById).mockResolvedValue({
        ...mockSavedQueryLinked,
        linkedQaObjectId: 'qa-obj-100',
        linkedQaCustomerKey: 'qa-key-100',
      });

      const detailMap = new Map([
        [
          'auto-1',
          {
            id: 'auto-1',
            name: 'Auto 1',
            status: 2,
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: 'act-1',
                    name: 'Activity 1',
                    objectTypeId: 300,
                    activityObjectId: 'qa-key-100',
                  },
                ],
              },
            ],
          },
        ],
      ]);

      vi.mocked(mceBridgeService.request).mockImplementation(((
        _t: string,
        _u: string,
        _m: string,
        config: { url: string },
      ) => {
        if (config.url.includes('/automation/v1/automations?')) {
          return Promise.resolve({
            items: [{ id: 'auto-1', name: 'Auto 1', status: 2 }],
            count: 1,
          });
        }
        const id = config.url.split('/').pop() ?? '';
        return Promise.resolve(
          detailMap.get(id) ?? { id, name: '', status: 0, steps: [] },
        );
      }) as any);

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(1);
      expect(result.automations[0]?.id).toBe('auto-1');
    });

    it('returns empty automations array when no automations contain the QA', async () => {
      setupBlastMock([
        {
          id: 'auto-1',
          name: 'Unrelated',
          status: 2,
          qaObjectId: 'qa-obj-other',
        },
      ]);

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
      setupBlastMock([
        {
          id: 'auto-running',
          name: 'Running Auto',
          status: 3,
          qaObjectId: 'qa-obj-100',
        },
        {
          id: 'auto-sched',
          name: 'Scheduled Auto',
          status: 6,
          qaObjectId: 'qa-obj-100',
        },
        {
          id: 'auto-trigger',
          name: 'Trigger Auto',
          status: 7,
          qaObjectId: 'qa-obj-100',
        },
      ]);

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
      const items: AutoDef[] = nonHighRiskStatuses.map((s, i) => ({
        id: `auto-${i}`,
        name: `Auto ${s}`,
        status: s,
        qaObjectId: 'qa-obj-100',
      }));

      setupBlastMock(items);

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
      setupBlastMock([
        { id: 'a1', name: 'Running', status: 3, qaObjectId: 'qa-obj-100' },
        { id: 'a2', name: 'Ready', status: 2, qaObjectId: 'qa-obj-100' },
        { id: 'a3', name: 'Scheduled', status: 6, qaObjectId: 'qa-obj-100' },
        { id: 'a4', name: 'Error', status: -1, qaObjectId: 'qa-obj-100' },
        { id: 'a5', name: 'Awaiting', status: 7, qaObjectId: 'qa-obj-100' },
      ]);

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
      const page1Auto: AutoDef = {
        id: 'auto-p1',
        name: 'Page 1 Auto',
        status: 2,
        qaObjectId: 'qa-obj-100',
      };
      const page2Auto: AutoDef = {
        id: 'auto-p2',
        name: 'Page 2 Auto',
        status: 3,
        qaObjectId: 'qa-obj-100',
      };

      const detailMap = new Map([
        [
          'auto-p1',
          {
            id: 'auto-p1',
            name: 'Page 1 Auto',
            status: 2,
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: 'act-p1',
                    name: 'Activity p1',
                    objectTypeId: 300,
                    activityObjectId: 'qa-obj-100',
                  },
                ],
              },
            ],
          },
        ],
        [
          'auto-p2',
          {
            id: 'auto-p2',
            name: 'Page 2 Auto',
            status: 3,
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: 'act-p2',
                    name: 'Activity p2',
                    objectTypeId: 300,
                    activityObjectId: 'qa-obj-100',
                  },
                ],
              },
            ],
          },
        ],
      ]);

      let listCallCount = 0;
      vi.mocked(mceBridgeService.request).mockImplementation(((
        _t: string,
        _u: string,
        _m: string,
        config: { url: string },
      ) => {
        if (config.url.includes('/automation/v1/automations?')) {
          listCallCount++;
          if (listCallCount === 1) {
            return Promise.resolve({
              items: [
                {
                  id: page1Auto.id,
                  name: page1Auto.name,
                  status: page1Auto.status,
                },
              ],
              count: 300,
            });
          }
          return Promise.resolve({
            items: [
              {
                id: page2Auto.id,
                name: page2Auto.name,
                status: page2Auto.status,
              },
            ],
            count: 300,
          });
        }
        const id = config.url.split('/').pop() ?? '';
        return Promise.resolve(
          detailMap.get(id) ?? { id, name: '', status: 0, steps: [] },
        );
      }) as any);

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

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
      setupBlastMock([
        { id: 'auto-1', name: 'Match 1', status: 2, qaObjectId: 'qa-obj-100' },
        {
          id: 'auto-2',
          name: 'No Match',
          status: 2,
          qaObjectId: 'qa-obj-other',
        },
        { id: 'auto-3', name: 'Match 2', status: 5, qaObjectId: 'qa-obj-100' },
      ]);

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
      setupBlastMock([
        {
          id: 'auto-1',
          name: 'Non-QA Activity',
          status: 2,
          qaObjectId: 'qa-obj-100',
          objectTypeId: 42,
        },
      ]);

      const result = await service.getBlastRadius(
        mockTenantId,
        mockUserId,
        mockMid,
        'sq-1',
      );

      expect(result.automations).toHaveLength(0);
    });

    describe('edge cases', () => {
      function mockListAndDetail(
        listResponse: unknown,
        detailResponse?: unknown,
      ) {
        vi.mocked(mceBridgeService.request).mockImplementation(((
          _t: string,
          _u: string,
          _m: string,
          config: { url: string },
        ) => {
          if (config.url.includes('/automation/v1/automations?')) {
            return Promise.resolve(listResponse);
          }
          return Promise.resolve(
            detailResponse ?? { id: '', name: '', status: 0, steps: [] },
          );
        }) as any);
      }

      it('returns empty automations when response.items is null', async () => {
        mockListAndDetail({ items: null, page: 1, pageSize: 200, count: 0 });

        const result = await service.getBlastRadius(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
        );

        expect(result.automations).toHaveLength(0);
        expect(result.totalCount).toBe(0);
      });

      it('returns empty automations when response.items is undefined', async () => {
        mockListAndDetail({ page: 1, pageSize: 200, count: 0 });

        const result = await service.getBlastRadius(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
        );

        expect(result.automations).toHaveLength(0);
        expect(result.totalCount).toBe(0);
      });

      it('defaults undefined statusId to 0 (BuildError)', async () => {
        mockListAndDetail(
          {
            items: [{ id: 'auto-no-status', name: 'No Status' }],
            count: 1,
          },
          {
            id: 'auto-no-status',
            name: 'No Status',
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: 'act-1',
                    name: 'Activity 1',
                    objectTypeId: 300,
                    activityObjectId: 'qa-obj-100',
                  },
                ],
              },
            ],
          },
        );

        const result = await service.getBlastRadius(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
        );

        expect(result.automations).toHaveLength(1);
        expect(result.automations[0]?.status).toBe('BuildError');
        expect(result.automations[0]?.isHighRisk).toBe(false);
      });

      it('maps unknown statusId (999) to "Unknown"', async () => {
        mockListAndDetail(
          {
            items: [{ id: 'auto-999', name: 'Unknown Status', statusId: 999 }],
            count: 1,
          },
          {
            id: 'auto-999',
            name: 'Unknown Status',
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: 'act-1',
                    name: 'Activity 1',
                    objectTypeId: 300,
                    activityObjectId: 'qa-obj-100',
                  },
                ],
              },
            ],
          },
        );

        const result = await service.getBlastRadius(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
        );

        expect(result.automations).toHaveLength(1);
        expect(result.automations[0]?.status).toBe('Unknown');
        expect(result.automations[0]?.isHighRisk).toBe(false);
      });

      it('stops pagination when response.count is undefined', async () => {
        mockListAndDetail(
          {
            items: [{ id: 'auto-1', name: 'Match', statusId: 2 }],
            page: 1,
            pageSize: 200,
          },
          {
            id: 'auto-1',
            name: 'Match',
            steps: [
              {
                stepNumber: 1,
                activities: [
                  {
                    id: 'act-1',
                    name: 'Activity 1',
                    objectTypeId: 300,
                    activityObjectId: 'qa-obj-100',
                  },
                ],
              },
            ],
          },
        );

        const result = await service.getBlastRadius(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
        );

        expect(result.automations).toHaveLength(1);
        const listCalls = vi
          .mocked(mceBridgeService.request)
          .mock.calls.filter((call) =>
            String((call[3] as { url: string }).url).includes(
              '/automation/v1/automations?',
            ),
          );
        expect(listCalls).toHaveLength(1);
      });

      it('skips automation when steps is null', async () => {
        mockListAndDetail(
          {
            items: [{ id: 'auto-null-steps', name: 'Null Steps', statusId: 2 }],
            count: 1,
          },
          {
            id: 'auto-null-steps',
            name: 'Null Steps',
            status: 2,
            steps: null,
          },
        );

        const result = await service.getBlastRadius(
          mockTenantId,
          mockUserId,
          mockMid,
          'sq-1',
        );

        expect(result.automations).toHaveLength(0);
      });

      it('skips step when activities is null', async () => {
        mockListAndDetail(
          {
            items: [
              {
                id: 'auto-null-acts',
                name: 'Null Activities',
                statusId: 2,
              },
            ],
            count: 1,
          },
          {
            id: 'auto-null-acts',
            name: 'Null Activities',
            status: 2,
            steps: [{ stepNumber: 1, activities: null }],
          },
        );

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
});
