# Test Infrastructure

This document describes the test infrastructure for the qs-pro monorepo.

## Overview

Tests are organized by type with different execution contexts:

| Type | Suffix | Location | Infrastructure | When to Run |
|------|--------|----------|----------------|-------------|
| Unit | `.unit.test.ts` | `src/**` (co-located) | None | During development |
| Integration | `.integration.test.ts` | `test/` (centralized) | Postgres, Redis | CI only |
| E2E | `.e2e.test.ts` | `test/` (centralized) | Full app stack | CI only |

## Running Tests

```bash
# Unit tests (fast, no infra needed - run during development)
pnpm test                          # All unit tests
pnpm --filter api test             # API unit tests
pnpm --filter @qpp/web test        # Web unit tests
pnpm --filter worker test          # Worker unit tests

# Integration tests (requires docker-compose up -d)
pnpm test:integration              # All integration tests

# E2E tests (requires full app running)
pnpm test:e2e                      # All e2e tests
pnpm --filter api test:e2e         # API e2e tests

# Convenience scripts (build packages first)
pnpm test:api                      # Build + API unit tests
pnpm test:web                      # Build + Web unit tests
pnpm test:worker                   # Build + Worker unit tests
```

## Test Separation Philosophy

**Unit tests (`pnpm test`):**
- Run fast with no infrastructure dependencies
- Mock all external services (DB, Redis, MCE)
- Safe to run frequently during development

**Integration tests (`pnpm test:integration`):**
- Require running Postgres and Redis (`docker-compose up -d`)
- Test real interactions between components
- Run on CI before merge

**E2E tests (`pnpm test:e2e`):**
- Require the full application stack
- Test complete user flows
- Run on CI before merge

## Shared Test Utilities (@qpp/test-utils)

All test factories and stubs live in `packages/test-utils/`.

### Factories

Create test entities with unique IDs:

```typescript
import { createMockUserSession, createMockJob, resetFactories } from '@qpp/test-utils';

describe('MyService', () => {
  beforeEach(() => {
    resetFactories(); // Reset counters for test isolation
  });

  it('should work', () => {
    const session = createMockUserSession(); // { userId: 'user-1', ... }
    const job = createMockJob(); // { runId: 'run-1', ... }
  });
});
```

### Available Factories

| Factory | Description |
|---------|-------------|
| `createMockUserSession()` | User session with unique userId, tenantId, mid |
| `createMockShellQueryContext()` | Shell query context with unique IDs + accessToken |
| `createMockShellQueryRun()` | Shell query run record |
| `createMockJob()` | ShellQueryJob data |
| `createMockBullJob()` | BullMQ job wrapper for ShellQueryJob |
| `createMockPollJobData()` | PollShellQueryJob data |
| `createMockPollBullJob()` | BullMQ job wrapper for PollShellQueryJob |

### Stubs

Create mock implementations for dependencies:

```typescript
import { createDbStub, createRedisStub, createMceBridgeStub } from '@qpp/test-utils';

const dbStub = createDbStub();
dbStub.setSelectResult([{ id: 'test' }]); // Configure return values

const redisStub = createRedisStub();
const mceBridgeStub = createMceBridgeStub();
```

### Available Stubs

| Stub | Description |
|------|-------------|
| `createDbStub()` | Drizzle ORM database with select/update/insert chains |
| `createRedisStub()` | Redis with pub/sub, get/set, duplicate |
| `createMceBridgeStub()` | MCE Bridge for SOAP/REST requests |
| `createRestDataServiceStub()` | MCE REST Data API |
| `createAsyncStatusServiceStub()` | MCE Async Status API |
| `createRlsContextStub()` | Row-Level Security context |
| `createQueueStub()` | BullMQ queue |
| `createMetricsStub()` | Prometheus metrics |
| `createEncryptionServiceStub()` | Encryption/decryption with 'encrypted:' prefix |
| `createSessionGuardMock()` | NestJS SessionGuard |
| `createTenantRepoStub()` | Tenant repository |
| `createShellQueryServiceStub()` | Shell query service |
| `createShellQueryRunRepoStub()` | Shell query run repository |
| `createShellQuerySseServiceStub()` | Shell query SSE service |
| `createDataFolderServiceStub()` | MCE Data Folder service |
| `createDataExtensionServiceStub()` | MCE Data Extension service |
| `createQueryDefinitionServiceStub()` | MCE Query Definition service |

## Configuration Files

| File | Purpose |
|------|---------|
| `vitest.config.ts` | Root config with workspace projects |
| `vitest.shared.ts` | Shared base config (excludes integration/e2e) |
| `apps/*/vitest.config.ts` | Per-app unit test configs |
| `apps/*/vitest-integration.config.ts` | Per-app integration test configs |
| `apps/*/vitest-e2e.config.ts` | Per-app e2e test configs |
| `packages/*/vitest.config.ts` | Per-package unit test configs |

## File Naming Convention

| Test Type | Location | Naming |
|-----------|----------|--------|
| Unit | `src/**/*.unit.test.ts` | Co-located with source |
| Integration | `test/**/*.integration.test.ts` | Centralized test dir |
| E2E | `test/**/*.e2e.test.ts` | Centralized test dir |

## Test Isolation

Always call `resetFactories()` in `beforeEach` to ensure unique IDs between tests:

```typescript
import { resetFactories } from '@qpp/test-utils';

beforeEach(() => {
  resetFactories();
  // ... other setup
});
```

This resets the internal counters that generate unique IDs, ensuring predictable test output.

## Adding New Factories/Stubs

1. Add factory/stub to appropriate file in `packages/test-utils/src/`
2. Export from the index file
3. If factory uses counters, add reset function to `setup/reset.ts`
4. Update this documentation
