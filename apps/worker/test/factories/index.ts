import { vi } from 'vitest';
import { ShellQueryJob, PollShellQueryJob } from '../../src/shell-query/shell-query.types';

export function createMockJob(overrides: Partial<ShellQueryJob> = {}): ShellQueryJob {
  return {
    runId: 'run-test-123',
    tenantId: 'tenant-1',
    userId: 'user-1',
    mid: 'mid-1',
    eid: 'eid-1',
    sqlText: 'SELECT SubscriberKey FROM _Subscribers',
    snippetName: 'Test Query',
    ...overrides,
  };
}

export function createMockBullJob(data: Partial<ShellQueryJob> = {}, name = 'execute-shell-query') {
  return {
    id: '1',
    name,
    data: createMockJob(data),
    isPaused: vi.fn().mockResolvedValue(false),
    isActive: vi.fn().mockResolvedValue(true),
    updateData: vi.fn().mockResolvedValue(undefined),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockPollJobData(overrides: Partial<PollShellQueryJob> = {}): PollShellQueryJob {
  return {
    runId: 'run-test-123',
    tenantId: 'tenant-1',
    userId: 'user-1',
    mid: 'mid-1',
    taskId: 'task-123',
    queryDefinitionId: 'query-def-123',
    queryCustomerKey: 'QPP_Query_run-test-123',
    targetDeName: 'QPP_Results_run-',
    pollCount: 0,
    pollStartedAt: new Date().toISOString(),
    notRunningConfirmations: 0,
    ...overrides,
  };
}

export function createMockPollBullJob(data: Partial<PollShellQueryJob> = {}) {
  return {
    id: 'poll-1',
    name: 'poll-shell-query',
    data: createMockPollJobData(data),
    isPaused: vi.fn().mockResolvedValue(false),
    isActive: vi.fn().mockResolvedValue(true),
    updateData: vi.fn().mockResolvedValue(undefined),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}
