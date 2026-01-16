import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserSession } from '../../common/decorators/current-user.decorator';
import { ShellQueryController } from '../shell-query.controller';
import { ShellQueryService } from '../shell-query.service';
import { ShellQuerySseService } from '../shell-query-sse.service';

describe('ShellQueryController - getRunStatus', () => {
  let controller: ShellQueryController;
  let shellQueryService: { getRunStatus: ReturnType<typeof vi.fn> };

  const mockUser: UserSession = {
    tenantId: 'tenant-1',
    userId: 'user-1',
    mid: 'mid-1',
  };

  beforeEach(async () => {
    shellQueryService = {
      getRunStatus: vi.fn(),
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

  it('returns current status for valid runId owned by user', async () => {
    // Arrange
    const mockRun = {
      runId: 'run-123',
      status: 'running',
      createdAt: new Date('2026-01-15T10:00:00Z'),
      updatedAt: new Date('2026-01-15T10:01:00Z'),
    };
    shellQueryService.getRunStatus.mockResolvedValue(mockRun);

    // Act
    const result = await controller.getRunStatus('run-123', mockUser);

    // Assert
    expect(result).toEqual(mockRun);
    expect(shellQueryService.getRunStatus).toHaveBeenCalledWith(
      'run-123',
      'tenant-1',
    );
  });

  it('returns 404 for non-existent runId', async () => {
    // Arrange
    shellQueryService.getRunStatus.mockRejectedValue(
      new NotFoundException('Run not found'),
    );

    // Act & Assert
    await expect(
      controller.getRunStatus('non-existent-run', mockUser),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns 404 for runId owned by different user (RLS hides existence)', async () => {
    // Arrange: RLS returns null for runs not owned by user, service throws 404
    shellQueryService.getRunStatus.mockRejectedValue(
      new NotFoundException('Run not found'),
    );

    // Act & Assert
    await expect(
      controller.getRunStatus('other-users-run', mockUser),
    ).rejects.toThrow(NotFoundException);
    expect(shellQueryService.getRunStatus).toHaveBeenCalledWith(
      'other-users-run',
      'tenant-1',
    );
  });

  it('includes errorMessage when status is failed', async () => {
    // Arrange
    const mockRun = {
      runId: 'run-failed',
      status: 'failed',
      errorMessage: 'Syntax error near SELECT',
      createdAt: new Date('2026-01-15T10:00:00Z'),
      updatedAt: new Date('2026-01-15T10:02:00Z'),
    };
    shellQueryService.getRunStatus.mockResolvedValue(mockRun);

    // Act
    const result = await controller.getRunStatus('run-failed', mockUser);

    // Assert
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toBe('Syntax error near SELECT');
  });
});
