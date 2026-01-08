// User session factory
export function createMockUserSession(overrides: Record<string, any> = {}) {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    mid: 'mid-1',
    ...overrides,
  };
}

// Shell query context factory
export function createMockShellQueryContext(
  overrides: Record<string, any> = {},
) {
  return {
    tenantId: 'tenant-1',
    userId: 'user-1',
    mid: 'mid-1',
    eid: 'eid-1',
    accessToken: 'token',
    ...overrides,
  };
}

// Shell query run factory
export function createMockShellQueryRun(overrides: Record<string, any> = {}) {
  return {
    id: 'run-123',
    tenantId: 'tenant-1',
    userId: 'user-1',
    mid: 'mid-1',
    snippetName: 'Test Query',
    sqlTextHash: 'abc123',
    status: 'queued',
    createdAt: new Date(),
    ...overrides,
  };
}
