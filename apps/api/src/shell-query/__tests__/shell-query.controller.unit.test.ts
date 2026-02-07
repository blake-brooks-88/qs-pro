import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { ErrorCode, SessionGuard } from '@qpp/backend-shared';
import {
  createMockUserSession,
  createShellQueryServiceStub,
  createShellQuerySseServiceStub,
  createTenantRepoStub,
  resetFactories,
} from '@qpp/test-utils';
import { EMPTY, of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { FeaturesService } from '../../features/features.service';
import { ShellQueryController } from '../shell-query.controller';
import { ShellQueryService } from '../shell-query.service';
import { ShellQuerySseService } from '../shell-query-sse.service';

function createFeaturesServiceStub() {
  return {
    getTenantFeatures: vi.fn().mockResolvedValue({
      tier: 'pro',
      features: {
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
        deployToAutomation: true,
      },
    }),
  };
}

describe('ShellQueryController', () => {
  let controller: ShellQueryController;
  let shellQueryService: ReturnType<typeof createShellQueryServiceStub>;
  let shellQuerySseService: ReturnType<typeof createShellQuerySseServiceStub>;
  let featuresService: ReturnType<typeof createFeaturesServiceStub>;
  let tenantRepo: ReturnType<typeof createTenantRepoStub>;

  beforeEach(async () => {
    resetFactories();

    shellQueryService = createShellQueryServiceStub();
    shellQuerySseService = createShellQuerySseServiceStub();
    featuresService = createFeaturesServiceStub();
    tenantRepo = createTenantRepoStub();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        {
          provide: ShellQueryService,
          useValue: shellQueryService,
        },
        {
          provide: ShellQuerySseService,
          useValue: shellQuerySseService,
        },
        {
          provide: FeaturesService,
          useValue: featuresService,
        },
        {
          provide: 'TENANT_REPOSITORY',
          useValue: tenantRepo,
        },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .overrideGuard(CsrfGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(ShellQueryController);
  });

  describe('POST /runs (createRun)', () => {
    it('rejects request with empty sqlText', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const body = { sqlText: '' };

      // Act & Assert
      await expect(controller.createRun(user, body)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects request with sqlText over 100k characters', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const body = { sqlText: 'A'.repeat(100_001) };

      // Act & Assert
      await expect(controller.createRun(user, body)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns 500 when tenant not found', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const body = { sqlText: 'SELECT 1' };
      tenantRepo.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.createRun(user, body)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('returns runId and queued status on success', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const body = { sqlText: 'SELECT SubscriberKey FROM _Subscribers' };
      shellQueryService.createRun.mockResolvedValue('run-abc123');

      // Act
      const result = await controller.createRun(user, body);

      // Assert
      expect(result).toEqual({ runId: 'run-abc123', status: 'queued' });
      expect(shellQueryService.createRun).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: user.tenantId,
          userId: user.userId,
          mid: user.mid,
        }),
        'SELECT SubscriberKey FROM _Subscribers',
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('rejects run-to-target when feature is not enabled', async () => {
      const user = createMockUserSession() as UserSession;
      const body = {
        sqlText: 'SELECT 1',
        targetDeCustomerKey: 'some-de-key',
      };

      featuresService.getTenantFeatures.mockResolvedValue({
        tier: 'free',
        features: {
          runToTargetDE: false,
          basicLinting: true,
          syntaxHighlighting: true,
          quickFixes: false,
          minimap: false,
          advancedAutocomplete: false,
          createDataExtension: false,
          systemDataViews: true,
          teamSnippets: false,
          auditLogs: false,
          deployToAutomation: false,
        },
      });

      await expect(controller.createRun(user, body)).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });
  });

  describe('GET /:runId (getRunStatus)', () => {
    it('delegates to service getRunStatus with correct parameters', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      const mockStatus = {
        runId,
        status: 'queued',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      shellQueryService.getRunStatus.mockResolvedValue(mockStatus);

      // Act
      await controller.getRunStatus(runId, user);

      // Assert
      expect(shellQueryService.getRunStatus).toHaveBeenCalledWith(
        runId,
        user.tenantId,
        user.mid,
        user.userId,
      );
    });

    it('returns status response from service', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      const mockStatus = {
        runId,
        status: 'ready',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      shellQueryService.getRunStatus.mockResolvedValue(mockStatus);

      // Act
      const result = await controller.getRunStatus(runId, user);

      // Assert
      expect(result).toEqual(mockStatus);
    });
  });

  describe('SSE /:runId/events (streamEvents)', () => {
    it('throws RESOURCE_NOT_FOUND when run does not exist', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'non-existent';
      shellQueryService.getRun.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.streamEvents(runId, user)).rejects.toMatchObject({
        code: ErrorCode.RESOURCE_NOT_FOUND,
      });
    });

    it('calls service getRun for ownership check', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      shellQueryService.getRun.mockResolvedValue({
        id: runId,
        status: 'queued',
      });
      shellQuerySseService.streamRunEvents.mockReturnValue(EMPTY);

      // Act
      await controller.streamEvents(runId, user);

      // Assert
      expect(shellQueryService.getRun).toHaveBeenCalledWith(
        runId,
        user.tenantId,
        user.mid,
        user.userId,
      );
    });

    it('returns observable from SSE service', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      const mockObservable = of({ data: { status: 'queued' } } as MessageEvent);
      shellQueryService.getRun.mockResolvedValue({
        id: runId,
        status: 'queued',
      });
      shellQuerySseService.streamRunEvents.mockReturnValue(mockObservable);

      // Act
      const result = await controller.streamEvents(runId, user);

      // Assert
      expect(result).toBe(mockObservable);
      expect(shellQuerySseService.streamRunEvents).toHaveBeenCalledWith(
        runId,
        user.userId,
      );
    });
  });

  describe('GET /:runId/results (getResults)', () => {
    it('rejects non-numeric page parameter', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';

      // Act & Assert
      await expect(controller.getResults(runId, 'abc', user)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects page less than 1', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';

      // Act & Assert
      await expect(controller.getResults(runId, '0', user)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects page greater than 50', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';

      // Act & Assert
      await expect(controller.getResults(runId, '51', user)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('delegates to service with parsed page number', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      const mockResults = {
        columns: ['SubscriberKey'],
        rows: [],
        totalRows: 0,
        page: 5,
        pageSize: 50,
      };
      shellQueryService.getResults.mockResolvedValue(mockResults);

      // Act
      const result = await controller.getResults(runId, '5', user);

      // Assert
      expect(shellQueryService.getResults).toHaveBeenCalledWith(
        runId,
        user.tenantId,
        user.userId,
        user.mid,
        5,
      );
      expect(result).toEqual(mockResults);
    });
  });

  describe('POST /:runId/cancel (cancelRun)', () => {
    it('delegates to service cancelRun with correct parameters', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      shellQueryService.cancelRun.mockResolvedValue({
        status: 'canceled',
        runId,
      });

      // Act
      await controller.cancelRun(runId, user);

      // Assert
      expect(shellQueryService.cancelRun).toHaveBeenCalledWith(
        runId,
        user.tenantId,
        user.mid,
        user.userId,
      );
    });

    it('returns cancellation result from service', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      const mockResult = { status: 'canceled', runId };
      shellQueryService.cancelRun.mockResolvedValue(mockResult);

      // Act
      const result = await controller.cancelRun(runId, user);

      // Assert
      expect(result).toEqual(mockResult);
    });
  });
});
