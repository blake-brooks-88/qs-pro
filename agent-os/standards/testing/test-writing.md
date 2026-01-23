# Test Writing Guidelines

## Test coverage best practices

- **Write Minimal Tests During Development**: Do NOT write tests for every change or intermediate step. Focus on completing the feature implementation first, then add strategic tests only at logical completion points
- **Test Only Core User Flows**: Write tests exclusively for critical paths and primary user workflows. Skip writing tests for non-critical utilities and secondary workflows until if/when you're instructed to do so.
- **Defer Edge Case Testing**: Do NOT test edge cases, error states, or validation logic unless they are business-critical. These can be addressed in dedicated testing phases, not during feature development.
- **Test Behavior, Not Implementation**: Focus tests on what the code does, not how it does it, to reduce brittleness
- **Clear Test Names**: Use descriptive names that explain what's being tested and the expected outcome
- **Mock External Dependencies**: Isolate units by mocking databases, APIs, file systems, and other external services
- **Fast Execution**: Keep unit tests fast (milliseconds) so developers run them frequently during development

## Using @qpp/test-utils

Always use shared utilities from `@qpp/test-utils` for test factories and stubs. See `test-infrastructure.md` for the full API reference.

### Factories

Use factories instead of inline object literals:

```typescript
// Good
import { createMockUserSession } from '@qpp/test-utils';
const session = createMockUserSession({ tenantId: 'custom-tenant' });

// Bad
const session = { userId: 'user-1', tenantId: 'tenant-1', mid: 'mid-1' };
```

Factories provide:
- **Unique IDs**: Each call generates unique identifiers for test isolation
- **Type safety**: Return types match the expected interfaces
- **Overrides**: Pass partial objects to customize specific fields

### Stubs

Use stubs for external dependencies:

```typescript
// Good
import { createDbStub, createRedisStub } from '@qpp/test-utils';
const db = createDbStub();
db.setSelectResult([{ id: 'test' }]);

// Bad
const db = { select: vi.fn(), update: vi.fn() };
```

Stubs provide:
- **Complete interfaces**: All methods properly mocked
- **Configurable returns**: Helper methods like `setSelectResult()`
- **Type safety**: Return types match expected interfaces

### Reset Between Tests

Always reset factories in `beforeEach` for test isolation:

```typescript
import { resetFactories } from '@qpp/test-utils';

beforeEach(() => {
  resetFactories();
  // ... other setup
});
```

This ensures:
- Counter-based IDs start from 1 in each test
- Predictable, debuggable test output
- No state leakage between tests

## Test File Structure

```typescript
import { /* dependencies */ } from '@qpp/backend-shared';
import { createDbStub, createMockUserSession, resetFactories } from '@qpp/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MyService } from '../src/my.service';

describe('MyService', () => {
  let service: MyService;
  let mockDb: ReturnType<typeof createDbStub>;

  beforeEach(() => {
    resetFactories();
    mockDb = createDbStub();
    service = new MyService(mockDb);
  });

  describe('methodName', () => {
    it('should do something when given valid input', async () => {
      // Arrange
      const session = createMockUserSession();
      mockDb.setSelectResult([{ id: 'test' }]);

      // Act
      const result = await service.methodName(session);

      // Assert
      expect(result).toBeDefined();
      expect(mockDb.select).toHaveBeenCalled();
    });
  });
});
```

## Naming Conventions

| Type | File Pattern | Example |
|------|--------------|---------|
| Unit test | `*.unit.test.ts` | `auth.service.unit.test.ts` |
| Integration test | `*.integration.test.ts` | `shell-query-producer.integration.test.ts` |
| E2E test | `*.e2e.test.ts` | `auth.e2e.test.ts` |
