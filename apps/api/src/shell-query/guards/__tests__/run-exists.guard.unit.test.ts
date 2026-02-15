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
    const runId = 'run-123';
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
    const runId = 'non-existent';
    shellQueryService.getRun.mockResolvedValue(null);
    const context = createMockExecutionContext(runId, user);

    // Act & Assert
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: ErrorCode.RESOURCE_NOT_FOUND,
    });
  });
});
