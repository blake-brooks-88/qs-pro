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
      tier: 'enterprise',
      features: {
        deployToAutomation: true,
        teamCollaboration: true,
        runToTargetDE: true,
        basicLinting: true,
        syntaxHighlighting: true,
        quickFixes: true,
        minimap: true,
        advancedAutocomplete: true,
        createDataExtension: true,
        systemDataViews: true,
        teamSnippets: false,
        auditLogs: false,
        executionHistory: true,
        versionHistory: true,
      },
    }),
  };
}

function enableTeamCollab(
  featuresService: ReturnType<typeof createFeaturesServiceStub>,
) {
  featuresService.getTenantFeatures.mockResolvedValue({
    tier: 'enterprise',
    features: { deployToAutomation: true, teamCollaboration: true },
  });
}

function disableTeamCollab(
  featuresService: ReturnType<typeof createFeaturesServiceStub>,
) {
  featuresService.getTenantFeatures.mockResolvedValue({
    tier: 'pro',
    features: { deployToAutomation: true, teamCollaboration: false },
  });
}

describe('QueryActivitiesController (publish)', () => {
  let controller: QueryActivitiesController;
  let qaService: ReturnType<typeof createServiceStub>;
  let featuresService: ReturnType<typeof createFeaturesServiceStub>;

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

  describe('POST publish/:savedQueryId (publishQuery)', () => {
    const mockUser = createMockUserSession() as UserSession;

    it('delegates to service.publish() with correct args when body is valid and teamCollaboration enabled', async () => {
      enableTeamCollab(featuresService);
      const body = {
        versionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const mockResponse = {
        publishEventId: 'pe-1',
        versionId: body.versionId,
        savedQueryId: 'sq-1',
        publishedSqlHash: 'abc123',
        publishedAt: '2026-02-10T12:00:00.000Z',
      };
      qaService.publish.mockResolvedValue(mockResponse);

      const result = await controller.publishQuery(mockUser, 'sq-1', body);

      expect(qaService.publish).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'sq-1',
        body.versionId,
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws FEATURE_NOT_ENABLED when teamCollaboration is disabled', async () => {
      disableTeamCollab(featuresService);
      const body = {
        versionId: '550e8400-e29b-41d4-a716-446655440000',
      };

      await expect(
        controller.publishQuery(mockUser, 'sq-1', body),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('returns the service response on success', async () => {
      enableTeamCollab(featuresService);
      const body = {
        versionId: '550e8400-e29b-41d4-a716-446655440000',
      };
      const expected = {
        publishEventId: 'pe-2',
        versionId: body.versionId,
        savedQueryId: 'sq-2',
        publishedSqlHash: 'def456',
        publishedAt: '2026-02-10T14:00:00.000Z',
      };
      qaService.publish.mockResolvedValue(expected);

      const result = await controller.publishQuery(mockUser, 'sq-2', body);

      expect(result).toEqual(expected);
    });
  });

  describe('GET drift/:savedQueryId (checkDrift)', () => {
    const mockUser = createMockUserSession() as UserSession;

    it('delegates to service.checkDrift() with correct args when teamCollaboration enabled', async () => {
      enableTeamCollab(featuresService);
      const mockResponse = {
        hasDrift: true,
        localSql: 'SELECT 1',
        remoteSql: 'SELECT 2',
        localHash: 'hash-1',
        remoteHash: 'hash-2',
      };
      qaService.checkDrift.mockResolvedValue(mockResponse);

      const result = await controller.checkDrift(mockUser, 'sq-1');

      expect(qaService.checkDrift).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'sq-1',
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws FEATURE_NOT_ENABLED when teamCollaboration is disabled', async () => {
      disableTeamCollab(featuresService);

      await expect(
        controller.checkDrift(mockUser, 'sq-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('returns the service response on success', async () => {
      enableTeamCollab(featuresService);
      const expected = {
        hasDrift: false,
        localSql: 'SELECT Name FROM [Sub]',
        remoteSql: 'SELECT Name FROM [Sub]',
        localHash: 'abc',
        remoteHash: 'abc',
      };
      qaService.checkDrift.mockResolvedValue(expected);

      const result = await controller.checkDrift(mockUser, 'sq-1');

      expect(result).toEqual(expected);
    });
  });

  describe('GET blast-radius/:savedQueryId (getBlastRadius)', () => {
    const mockUser = createMockUserSession() as UserSession;

    it('delegates to service.getBlastRadius() with correct args when teamCollaboration enabled', async () => {
      enableTeamCollab(featuresService);
      const mockResponse = {
        automations: [
          {
            id: 'auto-1',
            name: 'Daily Export',
            status: 'Running',
            isHighRisk: true,
          },
        ],
        totalCount: 1,
      };
      qaService.getBlastRadius.mockResolvedValue(mockResponse);

      const result = await controller.getBlastRadius(mockUser, 'sq-1');

      expect(qaService.getBlastRadius).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        mockUser.mid,
        'sq-1',
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws FEATURE_NOT_ENABLED when teamCollaboration is disabled', async () => {
      disableTeamCollab(featuresService);

      await expect(
        controller.getBlastRadius(mockUser, 'sq-1'),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('returns the service response on success', async () => {
      enableTeamCollab(featuresService);
      const expected = {
        automations: [],
        totalCount: 0,
      };
      qaService.getBlastRadius.mockResolvedValue(expected);

      const result = await controller.getBlastRadius(mockUser, 'sq-1');

      expect(result).toEqual(expected);
    });
  });

  // Route ordering note: drift/ and blast-radius/ are defined before :customerKey
  // in the controller to prevent NestJS from matching them as customerKey params.
  // This route ordering is verified by integration tests (Plan 04), not unit tests,
  // since unit tests call controller methods directly and do not exercise routing.
});
