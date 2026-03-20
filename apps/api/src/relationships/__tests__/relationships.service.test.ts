import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  AppError,
  type ConfigRule,
  type ContactBuilderEdge,
  ContactBuilderService,
  ErrorCode,
  RelationshipConfigService,
} from '@qpp/backend-shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RelationshipsService } from '../relationships.service';

function createContactBuilderStub() {
  return {
    getRelationshipEdges: vi.fn().mockResolvedValue([]),
    getAttributeGroups: vi.fn().mockResolvedValue([]),
    getAttributeSetDefinition: vi.fn().mockResolvedValue(null),
  };
}

function createConfigServiceStub() {
  return {
    ensureConfigDE: vi.fn().mockResolvedValue(undefined),
    getRules: vi.fn().mockResolvedValue([]),
    upsertRule: vi.fn().mockResolvedValue(undefined),
    deleteRule: vi.fn().mockResolvedValue(undefined),
  };
}

function createCacheStub() {
  return {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  };
}

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const MID = '12345';

describe('RelationshipsService', () => {
  let service: RelationshipsService;
  let contactBuilderStub: ReturnType<typeof createContactBuilderStub>;
  let configServiceStub: ReturnType<typeof createConfigServiceStub>;
  let cacheStub: ReturnType<typeof createCacheStub>;

  beforeEach(async () => {
    contactBuilderStub = createContactBuilderStub();
    configServiceStub = createConfigServiceStub();
    cacheStub = createCacheStub();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RelationshipsService,
        {
          provide: ContactBuilderService,
          useValue: contactBuilderStub,
        },
        {
          provide: RelationshipConfigService,
          useValue: configServiceStub,
        },
        {
          provide: CACHE_MANAGER,
          useValue: cacheStub,
        },
      ],
    }).compile();

    service = module.get(RelationshipsService);
  });

  describe('getGraph', () => {
    it('merges Contact Builder edges and config rules into a single graph', async () => {
      const cbEdges: ContactBuilderEdge[] = [
        {
          sourceDE: 'EmailDE',
          sourceColumn: 'SubscriberKey',
          targetDE: 'ContactGroup',
          targetColumn: 'ContactKey',
        },
      ];

      const rules: ConfigRule[] = [
        {
          RuleID: 'rule-1',
          RuleType: 'explicit_link',
          Payload: JSON.stringify({
            sourceDE: 'OrdersDE',
            sourceColumn: 'CustomerID',
            targetDE: 'CustomersDE',
            targetColumn: 'ID',
          }),
        },
      ];

      contactBuilderStub.getRelationshipEdges.mockResolvedValue(cbEdges);
      configServiceStub.getRules.mockResolvedValue(rules);

      const graph = await service.getGraph(TENANT_ID, USER_ID, MID);

      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0]).toEqual({
        sourceDE: 'EmailDE',
        sourceColumn: 'SubscriberKey',
        targetDE: 'ContactGroup',
        targetColumn: 'ContactKey',
        confidence: 'confirmed',
        source: 'attribute_group',
      });
      expect(graph.edges[1]).toEqual({
        sourceDE: 'OrdersDE',
        sourceColumn: 'CustomerID',
        targetDE: 'CustomersDE',
        targetColumn: 'ID',
        confidence: 'confirmed',
        source: 'user',
        ruleId: 'rule-1',
      });
    });

    it('returns cached result on second call', async () => {
      const cachedGraph = { edges: [], exclusions: [] };
      cacheStub.get.mockResolvedValue(cachedGraph);

      const result = await service.getGraph(TENANT_ID, USER_ID, MID);

      expect(result).toBe(cachedGraph);
      expect(contactBuilderStub.getAttributeGroups).not.toHaveBeenCalled();
    });

    it('caches the result after fetch', async () => {
      await service.getGraph(TENANT_ID, USER_ID, MID);

      expect(cacheStub.set).toHaveBeenCalledWith(
        `relationships:graph:${TENANT_ID}:${MID}`,
        expect.objectContaining({ edges: [], exclusions: [] }),
        600_000,
      );
    });

    it('returns graph with empty edges when Contact Builder throws MCE_FORBIDDEN', async () => {
      contactBuilderStub.getAttributeGroups.mockResolvedValue([]);
      configServiceStub.getRules.mockResolvedValue([
        {
          RuleID: 'rule-1',
          RuleType: 'explicit_link',
          Payload: JSON.stringify({
            sourceDE: 'A',
            sourceColumn: 'B',
            targetDE: 'C',
            targetColumn: 'D',
          }),
        },
      ]);

      const graph = await service.getGraph(TENANT_ID, USER_ID, MID);

      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0]?.source).toBe('user');
    });

    it('separates exclusion rules from edges', async () => {
      configServiceStub.getRules.mockResolvedValue([
        {
          RuleID: 'excl-1',
          RuleType: 'exclusion',
          Payload: JSON.stringify({
            sourceDE: 'A',
            sourceColumn: 'B',
            targetDE: 'C',
            targetColumn: 'D',
          }),
        },
      ]);

      const graph = await service.getGraph(TENANT_ID, USER_ID, MID);

      expect(graph.edges).toHaveLength(0);
      expect(graph.exclusions).toHaveLength(1);
      expect(graph.exclusions[0]).toEqual({
        sourceDE: 'A',
        sourceColumn: 'B',
        targetDE: 'C',
        targetColumn: 'D',
      });
    });
  });

  describe('saveRule', () => {
    it('calls ensureConfigDE before upsertRule and invalidates cache', async () => {
      const callOrder: string[] = [];
      configServiceStub.ensureConfigDE.mockImplementation(async () => {
        callOrder.push('ensureConfigDE');
      });
      configServiceStub.upsertRule.mockImplementation(async () => {
        callOrder.push('upsertRule');
      });
      cacheStub.del.mockImplementation(async () => {
        callOrder.push('cacheDelete');
      });

      await service.saveRule(TENANT_ID, USER_ID, MID, {
        ruleType: 'explicit_link',
        sourceDE: 'A',
        sourceColumn: 'B',
        targetDE: 'C',
        targetColumn: 'D',
      });

      expect(callOrder).toEqual([
        'ensureConfigDE',
        'upsertRule',
        'cacheDelete',
      ]);
    });

    it('wraps ensureConfigDE failure as CONFIG_DE_CREATION_FAILED', async () => {
      configServiceStub.ensureConfigDE.mockRejectedValue(
        new AppError(ErrorCode.MCE_SOAP_FAILURE),
      );

      await expect(
        service.saveRule(TENANT_ID, USER_ID, MID, {
          ruleType: 'explicit_link',
          sourceDE: 'A',
          sourceColumn: 'B',
          targetDE: 'C',
          targetColumn: 'D',
        }),
      ).rejects.toThrow(
        expect.objectContaining({ code: ErrorCode.CONFIG_DE_CREATION_FAILED }),
      );
    });
  });

  describe('deleteRule', () => {
    it('deletes the rule and invalidates cache', async () => {
      await service.deleteRule(TENANT_ID, USER_ID, MID, 'rule-1');

      expect(configServiceStub.deleteRule).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        MID,
        'rule-1',
      );
      expect(cacheStub.del).toHaveBeenCalledWith(
        `relationships:graph:${TENANT_ID}:${MID}`,
      );
    });
  });

  describe('dismissRelationship', () => {
    it('creates an exclusion rule with RuleType exclusion', async () => {
      await service.dismissRelationship(TENANT_ID, USER_ID, MID, {
        sourceDE: 'A',
        sourceColumn: 'B',
        targetDE: 'C',
        targetColumn: 'D',
      });

      expect(configServiceStub.upsertRule).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        MID,
        expect.objectContaining({ RuleType: 'exclusion' }),
      );
    });
  });
});
