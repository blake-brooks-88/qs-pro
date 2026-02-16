import { Test, type TestingModule } from '@nestjs/testing';
import { ErrorCode, SessionGuard } from '@qpp/backend-shared';
import { createMockUserSession, resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { FeaturesService } from '../../features/features.service';
import { QueryActivitiesController } from '../query-activities.controller';
import { QueryActivitiesService } from '../query-activities.service';

function createServiceStub() {
  return {
    create: vi.fn(),
    listAllWithLinkStatus: vi.fn(),
    getDetail: vi.fn(),
    linkQuery: vi.fn(),
    unlinkQuery: vi.fn(),
    publish: vi.fn(),
    checkDrift: vi.fn(),
    getBlastRadius: vi.fn(),
  };
}

function createFeaturesServiceStub() {
  return {
    getTenantFeatures: vi.fn().mockResolvedValue({
      tier: 'pro',
      features: { deployToAutomation: true },
    }),
  };
}

describe('QueryActivitiesController', () => {
  let controller: QueryActivitiesController;
  let qaService: ReturnType<typeof createServiceStub>;
  let featuresService: ReturnType<typeof createFeaturesServiceStub>;

  const mockUser = createMockUserSession() as UserSession;

  beforeEach(async () => {
    resetFactories();
    vi.resetAllMocks();

    qaService = createServiceStub();
    featuresService = createFeaturesServiceStub();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueryActivitiesController],
      providers: [
        { provide: QueryActivitiesService, useValue: qaService },
        { provide: FeaturesService, useValue: featuresService },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(QueryActivitiesController);
  });

  it('throws FEATURE_NOT_ENABLED when deployToAutomation is disabled', async () => {
    featuresService.getTenantFeatures.mockResolvedValue({
      tier: 'free',
      features: { deployToAutomation: false },
    });

    await expect(controller.findAll(mockUser)).rejects.toMatchObject({
      code: ErrorCode.FEATURE_NOT_ENABLED,
    });
  });

  describe('POST create()', () => {
    it('delegates to service.create() with parsed body', async () => {
      const body = {
        name: 'QA 1',
        targetDataExtensionCustomerKey: 'DE_KEY',
        queryText: 'SELECT 1',
        targetUpdateType: 'Overwrite' as const,
      };
      qaService.create.mockResolvedValue({ ok: true });

      const result = await controller.create(mockUser, body);

      expect(qaService.create).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        expect.objectContaining({
          name: 'QA 1',
          targetDataExtensionCustomerKey: 'DE_KEY',
          queryText: 'SELECT 1',
        }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('GET findAll()', () => {
    it('delegates to service.listAllWithLinkStatus()', async () => {
      qaService.listAllWithLinkStatus.mockResolvedValue([
        { customerKey: 'k1' },
      ]);

      const result = await controller.findAll(mockUser);

      expect(qaService.listAllWithLinkStatus).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
      );
      expect(result).toEqual([{ customerKey: 'k1' }]);
    });
  });

  describe('POST linkQuery()', () => {
    it('delegates to service.linkQuery() when body is valid', async () => {
      qaService.linkQuery.mockResolvedValue({ linkedQaCustomerKey: 'qa-1' });

      const result = await controller.linkQuery(mockUser, 'sq-1', {
        qaCustomerKey: 'qa-1',
        conflictResolution: 'keep-local',
      });

      expect(qaService.linkQuery).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'sq-1',
        'qa-1',
        'keep-local',
      );
      expect(result).toEqual({ linkedQaCustomerKey: 'qa-1' });
    });
  });

  describe('DELETE unlinkQuery()', () => {
    it('delegates to service.unlinkQuery() with parsed options when body is valid', async () => {
      qaService.unlinkQuery.mockResolvedValue({ ok: true });

      const result = await controller.unlinkQuery(mockUser, 'sq-1', {
        deleteLocal: true,
        deleteRemote: false,
      });

      expect(qaService.unlinkQuery).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'sq-1',
        { deleteLocal: true, deleteRemote: false },
      );
      expect(result).toEqual({ ok: true });
    });

    it('falls back to default options when body cannot be parsed', async () => {
      qaService.unlinkQuery.mockResolvedValue({ ok: true });

      const result = await controller.unlinkQuery(
        mockUser,
        'sq-1',
        'not-an-object',
      );

      expect(qaService.unlinkQuery).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'sq-1',
        { deleteLocal: false, deleteRemote: false },
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe('GET findOne()', () => {
    it('delegates to service.getDetail()', async () => {
      qaService.getDetail.mockResolvedValue({ customerKey: 'qa-1' });

      const result = await controller.findOne(mockUser, 'qa-1');

      expect(qaService.getDetail).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'qa-1',
      );
      expect(result).toEqual({ customerKey: 'qa-1' });
    });
  });
});
