import type { ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@qpp/backend-shared';
import { createShellQueryServiceStub } from '@qpp/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ShellQueryService } from '../../shell-query.service';
import { RunExistsGuard } from '../run-exists.guard';

function createMockExecutionContext(
  runId: string,
  user: { userId: string; tenantId: string; mid: string },
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { runId },
        user,
      }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => Object,
    getHandler: () => Object,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({ getContext: () => ({}), getData: () => ({}) }),
    switchToWs: () => ({
      getClient: () => ({}),
      getData: () => ({}),
      getPattern: () => '',
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

describe('RunExistsGuard', () => {
  let guard: RunExistsGuard;
  let shellQueryService: ReturnType<typeof createShellQueryServiceStub>;

  const user = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    mid: 'mid-1',
  };

  beforeEach(() => {
    shellQueryService = createShellQueryServiceStub();
    guard = new RunExistsGuard(
      shellQueryService as unknown as ShellQueryService,
    );
  });

  it('returns true when run exists', async () => {
    // Arrange
    const runId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    shellQueryService.getRun.mockResolvedValue({ id: runId, status: 'queued' });
    const context = createMockExecutionContext(runId, user);

    // Act
    const result = await guard.canActivate(context);

    // Assert
    expect(result).toBe(true);
    expect(shellQueryService.getRun).toHaveBeenCalledWith(
      runId,
      user.tenantId,
      user.mid,
      user.userId,
    );
  });

  it('throws RESOURCE_NOT_FOUND when run does not exist', async () => {
    // Arrange
    const runId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
    shellQueryService.getRun.mockResolvedValue(null);
    const context = createMockExecutionContext(runId, user);

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
    });
  });

  it('throws VALIDATION_ERROR when runId is not a valid UUID', async () => {
    // Arrange
    const runId = 'not-a-uuid';
    const context = createMockExecutionContext(runId, user);

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(shellQueryService.getRun).not.toHaveBeenCalled();
  });
});
