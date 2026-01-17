import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../common/decorators/current-user.decorator';
import { ShellQueryController } from '../shell-query.controller';
import { ShellQueryService } from '../shell-query.service';
import { ShellQuerySseService } from '../shell-query-sse.service';

describe('ShellQueryController', () => {
  let controller: ShellQueryController;
  let shellQueryService: {
    getRunStatus: ReturnType<typeof vi.fn>;
    getResults: ReturnType<typeof vi.fn>;
    cancelRun: ReturnType<typeof vi.fn>;
  };

  const mockUser: UserSession = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    mid: 'mid-1',
  };

  beforeEach(async () => {
    shellQueryService = {
      getRunStatus: vi.fn(),
      getResults: vi.fn(),
      cancelRun: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShellQueryController],
      providers: [
        { provide: ShellQueryService, useValue: shellQueryService },
        {
          provide: ShellQuerySseService,
          useValue: { streamRunEvents: vi.fn() },
        },
        { provide: 'TENANT_REPOSITORY', useValue: { findById: vi.fn() } },
      ],
    }).compile();

    controller = module.get<ShellQueryController>(ShellQueryController);
  });

  describe('getRunStatus', () => {
    it('returns current status for valid runId owned by user', async () => {
      const mockRun = {
        runId: 'run-123',
        status: 'running',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-01-15T10:01:00Z'),
      };
      shellQueryService.getRunStatus.mockResolvedValue(mockRun);

      const result = await controller.getRunStatus('run-123', mockUser);

      expect(result).toEqual(mockRun);
      expect(shellQueryService.getRunStatus).toHaveBeenCalledWith(
        'run-123',
        'tenant-1',
      );
    });

    it('returns 404 for non-existent runId', async () => {
      shellQueryService.getRunStatus.mockRejectedValue(
        new NotFoundException('Run not found'),
      );

      await expect(
        controller.getRunStatus('non-existent-run', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 404 for runId owned by different user (RLS hides existence)', async () => {
      shellQueryService.getRunStatus.mockRejectedValue(
        new NotFoundException('Run not found'),
      );

      await expect(
        controller.getRunStatus('other-users-run', mockUser),
      ).rejects.toThrow(NotFoundException);
      expect(shellQueryService.getRunStatus).toHaveBeenCalledWith(
        'other-users-run',
        'tenant-1',
      );
    });

    it('includes errorMessage when status is failed', async () => {
      const mockRun = {
        runId: 'run-failed',
        status: 'failed',
        errorMessage: 'Syntax error near SELECT',
        createdAt: new Date('2026-01-15T10:00:00Z'),
        updatedAt: new Date('2026-01-15T10:02:00Z'),
      };
      shellQueryService.getRunStatus.mockResolvedValue(mockRun);

      const result = await controller.getRunStatus('run-failed', mockUser);

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Syntax error near SELECT');
    });
  });

  describe('getResults', () => {
    it('calls ShellQueryService.getResults with parsed page number', async () => {
      const mockResults = {
        columns: ['email'],
        rows: [{ email: 'test@test.com' }],
        totalRows: 1,
        page: 2,
        pageSize: 50,
      };
      shellQueryService.getResults.mockResolvedValue(mockResults);

      const result = await controller.getResults('run-123', '2', mockUser);

      expect(result).toEqual(mockResults);
      expect(shellQueryService.getResults).toHaveBeenCalledWith(
        'run-123',
        'tenant-1',
        'user-1',
        'mid-1',
        2,
      );
    });

    it('throws 400 for invalid page number', async () => {
      await expect(
        controller.getResults('run-123', '0', mockUser),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancelRun', () => {
    it('calls ShellQueryService.cancelRun with runId + tenantId', async () => {
      const mockCancel = { status: 'canceled', runId: 'run-123' };
      shellQueryService.cancelRun.mockResolvedValue(mockCancel);

      const result = await controller.cancelRun('run-123', mockUser);

      expect(result).toEqual(mockCancel);
      expect(shellQueryService.cancelRun).toHaveBeenCalledWith(
        'run-123',
        'tenant-1',
      );
    });
  });
});
