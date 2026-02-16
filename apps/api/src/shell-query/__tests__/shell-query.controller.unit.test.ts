import {
  InternalServerErrorException,
  NotFoundException,
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
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CsrfGuard } from '../../auth/csrf.guard';
import type { UserSession } from '../../common/decorators/current-user.decorator';
import { FeaturesService } from '../../features/features.service';
import { UsageService } from '../../usage/usage.service';
import { RunExistsGuard } from '../guards/run-exists.guard';
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
        executionHistory: true,
        versionHistory: true,
      },
    }),
  };
}

function createUsageServiceStub() {
  return {
    getUsage: vi.fn(),
    getMonthlyRunCount: vi.fn().mockResolvedValue(0),
  };
}

describe('ShellQueryController', () => {
  let controller: ShellQueryController;
  let shellQueryService: ReturnType<typeof createShellQueryServiceStub>;
  let shellQuerySseService: ReturnType<typeof createShellQuerySseServiceStub>;
  let featuresService: ReturnType<typeof createFeaturesServiceStub>;
  let usageService: ReturnType<typeof createUsageServiceStub>;
  let tenantRepo: ReturnType<typeof createTenantRepoStub>;

  beforeEach(async () => {
    resetFactories();

    shellQueryService = createShellQueryServiceStub();
    shellQuerySseService = createShellQuerySseServiceStub();
    featuresService = createFeaturesServiceStub();
    usageService = createUsageServiceStub();
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
          provide: UsageService,
          useValue: usageService,
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
      .overrideGuard(RunExistsGuard)
      .useValue({ canActivate: vi.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(ShellQueryController);
  });

  describe('POST /runs (createRun)', () => {
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
          executionHistory: false,
          versionHistory: false,
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
    it('returns observable from SSE service', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const runId = 'run-123';
      const mockObservable = of({ data: { status: 'queued' } } as MessageEvent);
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
    it('delegates to service with page number', async () => {
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

      // Act — pipe parses query into { page: number } before reaching the method
      const result = await controller.getResults(runId, { page: 5 }, user);

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

  describe('GET /runs/history (getHistory)', () => {
    it('throws FEATURE_NOT_ENABLED when executionHistory is disabled', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
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
          executionHistory: false,
          versionHistory: false,
        },
      });

      // Act & Assert — pipe applies defaults, so pass parsed params
      await expect(
        controller.getHistory(user, {
          page: 1,
          pageSize: 25,
          sortBy: 'createdAt',
          sortDir: 'desc',
        }),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('delegates to service listHistory with parsed params', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      const mockResult = { items: [], total: 0, page: 1, pageSize: 25 };
      shellQueryService.listHistory.mockResolvedValue(mockResult);

      // Act — pipe parses query strings into typed params before reaching the method
      const result = await controller.getHistory(user, {
        page: 2,
        pageSize: 10,
        sortBy: 'createdAt',
        sortDir: 'desc',
      });

      // Assert
      expect(shellQueryService.listHistory).toHaveBeenCalledWith(
        user.tenantId,
        user.mid,
        user.userId,
        expect.objectContaining({ page: 2, pageSize: 10 }),
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('GET /runs/:runId/sql (getRunSqlText)', () => {
    it('throws FEATURE_NOT_ENABLED when executionHistory is disabled', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
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
          executionHistory: false,
          versionHistory: false,
        },
      });

      // Act & Assert
      await expect(
        controller.getRunSqlText('run-123', user),
      ).rejects.toMatchObject({
        code: ErrorCode.FEATURE_NOT_ENABLED,
      });
    });

    it('throws NotFoundException when service returns null', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      shellQueryService.getRunSqlText.mockResolvedValue(null);

      // Act & Assert
      await expect(controller.getRunSqlText('run-123', user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns sql wrapper on success', async () => {
      // Arrange
      const user = createMockUserSession() as UserSession;
      shellQueryService.getRunSqlText.mockResolvedValue('SELECT 1');

      // Act
      const result = await controller.getRunSqlText('run-123', user);

      // Assert
      expect(result).toEqual({ sql: 'SELECT 1' });
      expect(shellQueryService.getRunSqlText).toHaveBeenCalledWith(
        'run-123',
        user.tenantId,
        user.mid,
        user.userId,
      );
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
