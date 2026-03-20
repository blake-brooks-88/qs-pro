import { Test, type TestingModule } from '@nestjs/testing';
import { SessionGuard } from '@qpp/backend-shared';
import { createMockUserSession, resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { RelationshipsController } from '../relationships.controller';
import { RelationshipsService } from '../relationships.service';

function createServiceStub() {
  return {
    getGraph: vi.fn().mockResolvedValue({ edges: [], exclusions: [] }),
    saveRule: vi.fn().mockResolvedValue({
      RuleID: 'rule-1',
      RuleType: 'explicit_link',
      Payload: '{}',
    }),
    deleteRule: vi.fn().mockResolvedValue(undefined),
    dismissRelationship: vi.fn().mockResolvedValue({
      RuleID: 'rule-2',
      RuleType: 'exclusion',
      Payload: '{}',
    }),
  };
}

describe('RelationshipsController', () => {
  let controller: RelationshipsController;
  let service: ReturnType<typeof createServiceStub>;

  const mockUser = createMockUserSession() as UserSession;

  beforeEach(async () => {
    resetFactories();
    vi.resetAllMocks();

    service = createServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RelationshipsController],
      providers: [{ provide: RelationshipsService, useValue: service }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(RelationshipsController);
  });

  describe('GET /relationships/graph', () => {
    it('calls service.getGraph with user session values and returns result', async () => {
      const graph = {
        edges: [
          {
            sourceDE: 'A',
            sourceColumn: 'c',
            targetDE: 'B',
            targetColumn: 'd',
            confidence: 'confirmed',
            source: 'user',
          },
        ],
        exclusions: [],
      };
      service.getGraph.mockResolvedValue(graph);

      const result = await controller.getGraph(mockUser);

      expect(result).toEqual(graph);
      expect(service.getGraph).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
      );
    });
  });

  describe('POST /relationships/rules', () => {
    it('calls service.saveRule with valid input', async () => {
      const dto = {
        ruleType: 'explicit_link' as const,
        sourceDE: 'Subscribers',
        sourceColumn: 'SubscriberKey',
        targetDE: 'Orders',
        targetColumn: 'SubscriberKey',
      };

      await controller.saveRule(mockUser, dto);

      expect(service.saveRule).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        dto,
      );
    });
  });

  describe('DELETE /relationships/rules/:ruleId', () => {
    it('calls service.deleteRule and returns success', async () => {
      const ruleId = '550e8400-e29b-41d4-a716-446655440000';

      const result = await controller.deleteRule(mockUser, ruleId);

      expect(result).toEqual({ success: true });
      expect(service.deleteRule).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        ruleId,
      );
    });
  });

  describe('POST /relationships/dismiss', () => {
    it('calls service.dismissRelationship and returns rule', async () => {
      const dto = {
        sourceDE: 'Subscribers',
        sourceColumn: 'Email',
        targetDE: 'Campaigns',
        targetColumn: 'Email',
      };

      const result = await controller.dismiss(mockUser, dto);

      expect(result).toEqual({
        RuleID: 'rule-2',
        RuleType: 'exclusion',
        Payload: '{}',
      });
      expect(service.dismissRelationship).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        dto,
      );
    });
  });
});
