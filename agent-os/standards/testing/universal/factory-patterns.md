# Factory Patterns

Test data factories provide centralized, type-safe creation of test objects with deterministic IDs and consistent defaults.

## Philosophy

### Why Centralized Factories?

Factories solve critical test maintenance problems:

| Problem | Solution |
|---------|----------|
| Schema changes impact 30-50 files | Update only the factory |
| Non-deterministic IDs cause flakes | Counter-based deterministic IDs |
| Duplicated mock functions (13+) | Single source of truth |
| Inline object creation (150+) | Centralized factory functions |

### Impact Metrics

| Metric | Before | After |
|--------|--------|-------|
| Inline mock creations | 150+ | 0 |
| Duplicated factory functions | 13+ | 0 |
| Files per schema change | 30-50 | 1 |
| Flaky ID tests | Common | Eliminated |

---

## Core Patterns

### 1. Deterministic ID Generation

IDs MUST be predictable using counters, never random or time-based.

```typescript
// user.factory.ts
let userIdCounter = 1;

export function resetUserCounter() {
  userIdCounter = 1;
}

export function createUser(overrides?: Partial<User>): User {
  const id = overrides?.id ?? `user-${userIdCounter++}`;

  return {
    id,
    email: overrides?.email ?? `user${userIdCounter}@test.com`,
    name: overrides?.name ?? 'Test User',
  };
}
```

**Why:**
```typescript
// ✅ Deterministic, reliable
test('createUser_GeneratesSequentialIds', () => {
  resetAllFactories();
  const user1 = createUser();
  const user2 = createUser();

  expect(user1.id).toBe('user-1'); // Always passes
  expect(user2.id).toBe('user-2'); // Always passes
});

// ❌ Non-deterministic, flaky
const id = `user-${Date.now()}`; // Different every run
```

### 2. Minimal Defaults Pattern

Include ONLY required fields + sensible defaults. Use conditional spread for optional fields.

```typescript
export function createUser(overrides?: Partial<User>): User {
  const id = overrides?.id ?? `user-${userIdCounter++}`;

  return {
    // Required fields
    id,
    email: overrides?.email ?? `user${userIdCounter}@test.com`,
    name: overrides?.name ?? 'Test User',

    // Optional fields - only if provided
    ...(overrides?.bio && { bio: overrides.bio }),
    ...(overrides?.avatarUrl && { avatarUrl: overrides.avatarUrl }),
  };
}
```

**Result:**
```typescript
const user = createUser();
Object.keys(user); // ['id', 'email', 'name']
// No undefined properties
```

### 3. Override Pattern

Callers provide minimal overrides - only values that matter for their test.

```typescript
// ✅ Test only cares about email
const user = createUser({ email: 'john@test.com' });

// ✅ Test cares about multiple fields
const user = createUser({
  email: 'john@test.com',
  name: 'John Doe',
});

// ❌ Overriding defaults with same values (redundant)
const user = createUser({
  email: `user${userIdCounter}@test.com`, // Already the default
  name: 'Test User', // Already the default
});

// ❌ Overriding everything (defeats purpose)
const user = createUser({
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test',
  bio: 'Test bio',
  // What is this test actually testing?
});
```

### 4. Type-Specific Convenience Functions

Provide helpers for common type combinations.

```typescript
// Generic factory
export function createEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: overrides?.id ?? `entity-${entityIdCounter++}`,
    type: overrides?.type ?? 'table',
    name: overrides?.name ?? 'Test Entity',
  };
}

// Type-specific convenience
export function createTable(overrides?: Partial<Entity>): Entity {
  return createEntity({ type: 'table', ...overrides });
}

export function createView(overrides?: Partial<Entity>): Entity {
  return createEntity({ type: 'view', ...overrides });
}
```

**Usage:**
```typescript
// ✅ Clear and concise
const table = createTable({ name: 'users' });

// ✅ Also valid, but more verbose
const table = createEntity({ type: 'table', name: 'users' });
```

---

## Factory Architecture

### Directory Structure

```
test-utils/factories/
├── index.ts              # Barrel export (single import)
├── reset.ts              # Centralized reset utilities
├── user.factory.ts       # User factories
├── post.factory.ts       # Post factories
├── comment.factory.ts    # Comment factories
└── builders/
    ├── index.ts          # Builder barrel export
    ├── user-with-posts.builder.ts
    └── post-with-comments.builder.ts
```

### Import Pattern

Always import from the barrel:

```typescript
// ✅ Single import from barrel
import {
  createUser,
  createPost,
  resetAllFactories
} from '@/test-utils/factories';

// ❌ Direct file imports
import { createUser } from '@/test-utils/factories/user.factory';
```

---

## Builder Pattern

### When to Use Builders

**Use simple factories when:**
- Creating single objects
- Relationships don't matter
- Default configurations sufficient

**Use builders when:**
- Creating complex objects with relationships
- Creating multiple related objects
- Coordinating foreign keys
- Realistic multi-field objects for integration tests

### Builder Example

```typescript
// UserWithPostsBuilder creates user + multiple posts
import { UserWithPostsBuilder } from '@/test-utils/factories/builders';

test('UserWithPosts_CreatesRelationship', () => {
  // Arrange
  const result = new UserWithPostsBuilder()
    .withName('John Doe')
    .withPost({ title: 'First Post' })
    .withPost({ title: 'Second Post' })
    .build();

  // Assert
  expect(result.user.id).toBe('user-1');
  expect(result.posts).toHaveLength(2);
  expect(result.posts[0].userId).toBe(result.user.id); // FK coordinated
});
```

### Builder Return Pattern

Builders return an object containing ALL created entities, not just the primary one.

```typescript
// ✅ Returns all created entities
interface UserWithPostsResult {
  user: User;
  posts: Post[];
}

class UserWithPostsBuilder {
  build(): UserWithPostsResult {
    return {
      user: this.user,
      posts: this.posts,
    };
  }
}

// ❌ Only returns primary entity, loses context
class UserWithPostsBuilder {
  build(): User {
    return this.user; // Where did posts go?
  }
}
```

---

## Factory Reset & Test Isolation

### Why Reset is Critical

Without reset, tests become interdependent:

```typescript
// ❌ Tests fail unpredictably without reset
describe('Without reset', () => {
  test('first_test', () => {
    const user1 = createUser(); // Gets 'user-1'
    expect(user1.id).toBe('user-1'); // ✅ Passes
  });

  test('second_test', () => {
    const user1 = createUser(); // Gets 'user-2' (!!)
    expect(user1.id).toBe('user-1'); // ❌ Fails!
  });
});

// ✅ Tests isolated with reset
describe('With reset', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('first_test', () => {
    const user1 = createUser(); // Gets 'user-1'
    expect(user1.id).toBe('user-1'); // ✅ Passes
  });

  test('second_test', () => {
    const user1 = createUser(); // Gets 'user-1' again
    expect(user1.id).toBe('user-1'); // ✅ Passes
  });
});
```

### Reset Patterns

**Pattern 1: Reset All Factories (Recommended)**

```typescript
import { resetAllFactories } from '@/test-utils/factories';

describe('MyComponent', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  // tests...
});
```

**Pattern 2: Reset Individual Factories (Rare)**

```typescript
import { resetUserCounter, resetPostCounter } from '@/test-utils/factories';

describe('UserService', () => {
  beforeEach(() => {
    resetUserCounter(); // Only reset user counter
  });
});
```

**Pattern 3: Reset in Specific Tests (Very Rare)**

```typescript
test('createUser_AfterReset_StartsFromOne', () => {
  createUser(); // user-1
  createUser(); // user-2

  resetUserCounter(); // Reset mid-test

  const user = createUser(); // user-1 again
  expect(user.id).toBe('user-1');
});
```

### When Reset is Required

| Situation | Reset? | Rationale |
|-----------|--------|-----------|
| Using any factory | ✅ Yes | Ensures deterministic IDs |
| Only mocking services | ❌ No | Nothing to reset |
| Integration tests | ✅ Yes | Test isolation critical |
| Contract tests | ❌ No | Not using factories |

---

## Migration Patterns

### Pattern 1: Simple Inline Object

**Before:**
```typescript
test('should save user', () => {
  const user = {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test User',
  };

  const result = saveUser(user);
  expect(result.success).toBe(true);
});
```

**After (Stage 1 - Preserve):**
```typescript
test('saveUser_WithValidData_Persists', () => {
  // Arrange - Preserve exact values
  const user = createUser({
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test User',
  });

  // Act
  const result = saveUser(user);

  // Assert
  expect(result.success).toBe(true);
});
```

**After (Stage 2 - Simplify):**
```typescript
test('saveUser_WithValidData_Persists', () => {
  // Arrange - Only override what matters
  const user = createUser();

  // Act
  const result = saveUser(user);

  // Assert
  expect(result.success).toBe(true);
});
```

### Pattern 2: Local Factory Function

**Before:**
```typescript
// In test file
function createMockUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test',
    ...overrides,
  };
}

test('should render user', () => {
  const user = createMockUser({ name: 'John' });
  render(<UserCard user={user} />);
  expect(screen.getByText('John')).toBeInTheDocument();
});
```

**After:**
```typescript
import { createUser, resetAllFactories } from '@/test-utils/factories';

describe('UserCard', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('render_WithUserName_DisplaysName', () => {
    // Arrange
    const user = createUser({ name: 'John' });

    // Act
    render(<UserCard user={user} />);

    // Assert
    expect(screen.getByText('John')).toBeInTheDocument();
  });
});
```

### Pattern 3: Complex Object with Relationships

**Before:**
```typescript
test('should create relationship', () => {
  const user = {
    id: 'user-1',
    name: 'John',
  };

  const post = {
    id: 'post-1',
    title: 'Test Post',
    userId: 'user-1', // Manual FK coordination
  };

  const result = createPost(post);
  expect(result.success).toBe(true);
});
```

**After (Using Builder):**
```typescript
import { UserWithPostsBuilder } from '@/test-utils/factories/builders';

test('createPost_WithUser_CreatesRelationship', () => {
  // Arrange - Builder coordinates FKs
  const { user, posts } = new UserWithPostsBuilder()
    .withName('John')
    .withPost({ title: 'Test Post' })
    .build();

  // Act
  const result = createPost(posts[0]);

  // Assert
  expect(result.success).toBe(true);
  expect(posts[0].userId).toBe(user.id); // FK auto-coordinated
});
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Creating Inline Objects

```typescript
// ❌ Bad - Inline object in behavioral test
test('should save user', () => {
  const user = {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test',
  };

  saveUser(user);
});

// ✅ Good - Use factory
test('saveUser_WithValidData_Persists', () => {
  const user = createUser();
  saveUser(user);
});
```

**Exception:** Contract tests validating schemas MAY use inline objects:

```typescript
// ✅ Acceptable in contract tests
test('userSchema_RejectsInvalidEmail', () => {
  const invalidUser = {
    id: 'user-1',
    email: 'not-an-email', // Testing validation
    name: 'Test',
  };

  expect(() => userSchema.parse(invalidUser)).toThrow();
});
```

### ❌ Anti-Pattern 2: Local Factory Functions

```typescript
// ❌ Bad - Local factory duplicates logic
function createTestUser() {
  return {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test',
  };
}

// ✅ Good - Use centralized factory
import { createUser } from '@/test-utils/factories';
```

### ❌ Anti-Pattern 3: Non-Deterministic IDs

```typescript
// ❌ Bad - Time-based ID
const user = createUser({
  id: `user-${Date.now()}`, // Different every run
});

// ❌ Bad - Random ID
const user = createUser({
  id: `user-${Math.random()}`, // Non-deterministic
});

// ✅ Good - Let factory handle IDs
const user = createUser(); // Gets 'user-1', 'user-2', etc.
```

### ❌ Anti-Pattern 4: Forgetting to Reset

```typescript
// ❌ Bad - No reset, tests interdependent
describe('UserService', () => {
  test('first_test', () => {
    const user = createUser(); // user-1
    expect(user.id).toBe('user-1');
  });

  test('second_test', () => {
    const user = createUser(); // user-2 (!!)
    expect(user.id).toBe('user-1'); // ❌ Fails
  });
});

// ✅ Good - Reset ensures isolation
describe('UserService', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('first_test', () => {
    const user = createUser(); // user-1
    expect(user.id).toBe('user-1'); // ✅ Passes
  });

  test('second_test', () => {
    const user = createUser(); // user-1 (reset)
    expect(user.id).toBe('user-1'); // ✅ Passes
  });
});
```

### ❌ Anti-Pattern 5: Over-Specifying Overrides

```typescript
// ❌ Bad - Overriding everything
const user = createUser({
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
  bio: 'Test bio',
  avatarUrl: 'https://example.com/avatar.jpg',
  // What is important here?
});

// ✅ Good - Only override what matters
const user = createUser({ email: 'test@test.com' });
```

---

## FAQ

### Q: When should I use a factory vs a builder?

**A:**
- **Factory:** Single object, default config fine, minimal overrides
- **Builder:** Multiple related objects, complex relationships, coordinated FKs

### Q: Can I create local helper factories for DTOs?

**A:** Yes, for integration tests needing DTO-specific stubs.

```typescript
// ✅ Acceptable for local DTO helper
function createInsertUserDTO(): InsertUser {
  return {
    email: 'test@test.com',
    name: 'Test User',
  };
}
```

If used in multiple files, consider adding to centralized factories.

### Q: What if factory defaults don't work for my test?

**A:** Override only what you need:

```typescript
// Test needs user with no bio
const user = createUser({ bio: undefined });

// Test needs specific email
const user = createUser({ email: 'john@test.com' });
```

### Q: Should I reset factories in integration tests?

**A:** Yes! Integration tests need deterministic IDs and test isolation.

```typescript
describe('Database Integration', () => {
  beforeEach(() => {
    resetAllFactories(); // Critical
    clearDatabase();
  });

  // tests...
});
```

### Q: How do I add a new factory?

**A:**
1. Create factory function in appropriate file
2. Implement deterministic ID with counter
3. Use minimal defaults with optional field spreading
4. Add reset function and register in `reset.ts`
5. Export from barrel (`index.ts`)
6. Add JSDoc comments
7. Write validation tests

### Q: What about factory validation tests?

**A:** Every factory should validate schema compliance:

```typescript
test('createUser_WithDefaults_ProducesValidUser', () => {
  const user = createUser();
  expect(() => userSchema.parse(user)).not.toThrow();
});
```

---

## Summary

### Key Principles

1. **Always use centralized factories** (except contract tests)
2. **Deterministic IDs** using counters, never random
3. **Minimal defaults** with optional field spreading
4. **Override minimally** - only specify what matters
5. **Reset in beforeEach()** for test isolation
6. **Use builders** for complex multi-object scenarios
7. **Import from barrel** for consistency

### Quick Reference

```typescript
import {
  createUser,
  createPost,
  resetAllFactories
} from '@/test-utils/factories';
import { UserWithPostsBuilder } from '@/test-utils/factories/builders';

describe('MyComponent', () => {
  beforeEach(() => {
    resetAllFactories(); // MUST reset
  });

  test('MethodName_StateUnderTest_ExpectedBehavior', () => {
    // Arrange - Factories with minimal overrides
    const user = createUser({ name: 'John' });

    // Act - Single action
    const result = doSomething(user);

    // Assert - Clear expectations
    expect(result.success).toBe(true);
  });
});
```
