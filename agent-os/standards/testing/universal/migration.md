# Test Migration - Lock-and-Refactor Process

Step-by-step guidance for migrating tests from inline objects and local factories to centralized factory patterns.

## Migration Philosophy

### The Two-Stage Process

**Stage 1: Preserve and Lock** - Change data source ONLY
- Replace inline objects with factories using heavy overrides
- Output must be 100% identical
- Tests must still pass
- 0 NEW errors allowed

**Stage 2: Refactor and Simplify** - Remove unnecessary overrides
- Remove overrides matching factory defaults
- Simplify test code
- Tests must still pass
- 0 errors total

### Why Two Stages?

1. **Safety:** Changes isolated and reversible
2. **Confidence:** Tests validate each stage independently
3. **Debugging:** Easy to identify which stage introduced issues
4. **Git History:** Clear commits show intent

### Zero Tolerance for Errors

🚨 **CRITICAL:** You MUST have 0 NEW errors after each stage.

**Why:**
- Errors compound and become harder to fix
- "Fix it later" creates technical debt
- Errors hide real issues
- Clean migrations easier to review

---

## Stage 1: Preserve and Lock

### Goal

Replace inline objects with factories while maintaining 100% identical output. Test behavior should NOT change at all.

### Step-by-Step Process

#### Step 1: Baseline Check (MANDATORY)

Before ANY changes, record current state:

```bash
# 1. Run type checker to get baseline
npm run type-check > baseline-errors.txt

# 2. Run tests in isolation
npm test -- path/to/file.test.ts

# 3. Confirm all tests pass
```

**Record:**
- Number of type errors BEFORE migration
- All tests passing ✅

#### Step 2: Identify Inline Objects

Find all inline object creations:

```typescript
// Example patterns to find:
const user = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
};

const post = {
  id: 'post-1',
  title: 'Test Post',
  userId: 'user-1',
};
```

Make a list of ALL inline objects to replace.

#### Step 3: Add Factory Imports

```typescript
import {
  createUser,
  createPost,
  resetAllFactories,
} from '@/test-utils/factories';
```

#### Step 4: Add beforeEach with Factory Reset

```typescript
describe('YourComponent', () => {
  beforeEach(() => {
    resetAllFactories(); // MUST add this
    // ... other setup
  });

  // tests...
});
```

#### Step 5: Replace Inline Objects with Heavy Overrides

**Key principle:** Use factories with enough overrides to produce IDENTICAL output.

```typescript
// BEFORE (Inline)
const user = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
};

// AFTER (Factory with heavy overrides - Stage 1)
const user = createUser({
  id: 'user-1',           // Preserve exact ID
  email: 'test@test.com', // Preserve exact email
  name: 'Test User',      // Preserve exact name
});
```

**Important:** Even if override matches factory default, include it in Stage 1 for identical output.

#### Step 6: Validate Tests Still Pass

```bash
npm test -- path/to/file.test.ts
```

**All tests MUST be green.** If any fail:
1. Check overrides produce identical output
2. Use logging to compare before/after
3. Fix discrepancies before proceeding

#### Step 7: Type Check (BLOCKING)

```bash
npm run type-check > stage1-errors.txt
diff baseline-errors.txt stage1-errors.txt
```

**Requirement:** MUST show 0 NEW errors.

**If new errors appear, fix them before proceeding.**

#### Step 8: Commit Stage 1

```bash
git add path/to/file.test.ts
git commit -m "refactor: migrate ComponentName tests to factories (preserve stage)"
```

---

## Stage 2: Refactor and Simplify

### Goal

Remove unnecessary overrides, relying on factory defaults. Tests should be cleaner and more maintainable.

### Step-by-Step Process

#### Step 1: Identify Unnecessary Overrides

Compare each override to factory default:

```typescript
// Stage 1 (heavy overrides)
const user = createUser({
  id: 'user-1',           // Check: Is this the default? (Yes)
  email: 'test@test.com', // Check: Is this the default? (No, default is user1@test.com)
  name: 'Test User',      // Check: Is this the default? (Yes)
});

// Can simplify to:
const user = createUser({
  email: 'test@test.com', // Only keep what's different!
});
```

**Keep overrides when:**
- Value differs from factory default
- Test specifically needs that value
- Removing it breaks the test

**Remove overrides when:**
- Value matches factory default
- Test doesn't care about that value

#### Step 2: Remove Redundant Overrides

```typescript
// BEFORE (Stage 1)
test('UserCard_WithUserName_DisplaysName', () => {
  // Arrange
  const user = createUser({
    id: 'user-1',
    email: 'john@test.com',
    name: 'John Doe',
  });

  // Act
  render(<UserCard user={user} />);

  // Assert
  expect(screen.getByText('John Doe')).toBeInTheDocument();
});

// AFTER (Stage 2 - simplified)
test('UserCard_WithUserName_DisplaysName', () => {
  // Arrange - Only override name (what test cares about)
  const user = createUser({ name: 'John Doe' });

  // Act
  render(<UserCard user={user} />);

  // Assert
  expect(screen.getByText('John Doe')).toBeInTheDocument();
});
```

**Notice:**
- Only kept `name` override (what test cares about)
- Removed `id`, `email` (test doesn't care)

#### Step 3: Use Type-Specific Convenience Functions

Replace generic factories with type-specific helpers:

```typescript
// BEFORE
const entity = createEntity({ type: 'table' });

// AFTER
const table = createTable();

// BEFORE
const field = createField({ type: 'text' });

// AFTER
const field = createTextField();

// BEFORE
const field = createField({
  name: 'id',
  type: 'uuid',
  isPK: true,
  isFK: false,
});

// AFTER
const field = createPKField();
```

#### Step 4: Validate Tests Still Pass

```bash
npm test -- path/to/file.test.ts
```

**All tests MUST be green.**

#### Step 5: Type Check (BLOCKING)

```bash
npm run type-check
```

**Requirement:** MUST show 0 errors.

#### Step 6: Lint Check (BLOCKING)

```bash
npm run lint
```

**Requirement:** MUST show 0 errors.

#### Step 7: Final Validation

```bash
# 1. Tests pass
npm test -- path/to/file.test.ts

# 2. No type errors
npm run type-check

# 3. No lint errors
npm run lint
```

**All three MUST pass before committing.**

#### Step 8: Commit Stage 2

```bash
git add path/to/file.test.ts
git commit -m "refactor: simplify ComponentName factory overrides"
```

---

## Common Migration Patterns

### Pattern 1: Simple Inline Object

**Before:**
```typescript
const user = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
};
```

**Stage 1 (Preserve):**
```typescript
const user = createUser({
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
});
```

**Stage 2 (Simplify):**
```typescript
const user = createUser(); // Use all defaults if test doesn't care
// OR
const user = createUser({ email: 'test@test.com' }); // Only if email matters
```

### Pattern 2: Local Factory Function

**Before:**
```typescript
// Local helper in test file
function createMockUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'test@test.com',
    name: 'Test',
    ...overrides,
  };
}

test('renders user', () => {
  const user = createMockUser({ name: 'John' });
  // ...
});
```

**After (Combined):**
```typescript
// Remove local helper entirely
import { createUser, resetAllFactories } from '@/test-utils/factories';

describe('Component', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('renders user', () => {
    const user = createUser({ name: 'John' });
    // ...
  });
});
```

### Pattern 3: Complex Array

**Before:**
```typescript
const user = {
  id: 'user-1',
  name: 'John',
  posts: [
    { id: 'post-1', title: 'First Post', userId: 'user-1' },
    { id: 'post-2', title: 'Second Post', userId: 'user-1' },
  ],
};
```

**Stage 1 (Preserve):**
```typescript
const user = createUser({
  id: 'user-1',
  name: 'John',
  posts: [
    createPost({
      id: 'post-1',
      title: 'First Post',
      userId: 'user-1',
    }),
    createPost({
      id: 'post-2',
      title: 'Second Post',
      userId: 'user-1',
    }),
  ],
});
```

**Stage 2 (Simplify):**
```typescript
const user = createUser({
  name: 'John',
  posts: [
    createPost({ title: 'First Post' }),
    createPost({ title: 'Second Post' }),
  ],
});
```

### Pattern 4: Complex Relationships

**Before:**
```typescript
const author = {
  id: 'user-1',
  name: 'John',
};

const post = {
  id: 'post-1',
  title: 'Test Post',
  authorId: 'user-1', // Manual FK coordination
};
```

**After (Using Builder):**
```typescript
import { UserWithPostsBuilder } from '@/test-utils/factories/builders';

const { user, posts } = new UserWithPostsBuilder()
  .withName('John')
  .withPost({ title: 'Test Post' })
  .build();
// FK automatically coordinated
```

---

## Type Error Resolution

### Common Errors and Solutions

#### Error 1: Possibly Undefined Array Access

```typescript
// ❌ Error
const item = array[0];
await user.click(item); // Error: item possibly undefined

// ✅ Fix - Validate before use
const items = screen.getAllByRole('button');
expect(items[0]).toBeDefined();
await user.click(items[0]!); // Non-null assertion AFTER validation
```

#### Error 2: Mock Call Access

```typescript
// ❌ Error
const arg = mockFn.mock.calls[0][0];
expect(arg.name).toBe('Test'); // Error: arg possibly undefined

// ✅ Fix - Optional chaining + validation
const arg = mockFn.mock.calls[0]?.[0];
expect(arg).toBeDefined();
expect(arg?.name).toBe('Test');
```

#### Error 3: Missing Required Fields

```typescript
// ❌ Error
const data = {
  name: 'Test',
  // Missing required fields!
};

// ✅ Fix - Complete the object
function createDataStub() {
  return {
    name: 'Test',
    requiredField1: [],
    requiredField2: {},
  };
}
```

#### Error 4: Strict Null Checks

```typescript
// ❌ Error
const item = getItem('id-1'); // Returns Item | null
processItem(item); // Error: item might be null

// ✅ Fix - Null check
const item = getItem('id-1');
expect(item).toBeDefined();
processItem(item!); // Non-null assertion AFTER validation

// OR use type guard
if (item !== null) {
  processItem(item); // TypeScript knows item is not null
}
```

### Prohibited Solutions

❌ **NEVER use these:**

```typescript
// ❌ NEVER: @ts-ignore
// @ts-ignore
const item = array[0];

// ❌ NEVER: @ts-expect-error
// @ts-expect-error
const data = mockCall[0][0];

// ❌ NEVER: any type
const data: any = getData();
```

✅ **ALWAYS use proper type safety:**

```typescript
// ✅ Validate then assert
const item = array[0];
expect(item).toBeDefined();
await user.click(item!);

// ✅ Optional chaining
const data = mockCall[0]?.[0];
expect(data).toBeDefined();

// ✅ Type guards
if (item !== null) {
  // TypeScript narrows type
}
```

---

## Validation Checklist

### Stage 1: Preserve and Lock

- [ ] Baseline error count recorded
- [ ] All tests passing BEFORE changes
- [ ] Factory imports added
- [ ] `resetAllFactories()` in `beforeEach()`
- [ ] All inline objects replaced (heavy overrides)
- [ ] All tests passing AFTER changes
- [ ] 0 NEW type errors (compare to baseline)
- [ ] Committed with: `refactor: migrate [Name] to factories (preserve stage)`

### Stage 2: Refactor and Simplify

- [ ] Identified unnecessary overrides
- [ ] Removed overrides matching defaults
- [ ] Used type-specific convenience functions
- [ ] All tests passing
- [ ] 0 type errors (total)
- [ ] 0 lint errors
- [ ] Committed with: `refactor: simplify [Name] factory overrides`

### Final Checklist

- [ ] Tests pass
- [ ] Type check clean (0 errors)
- [ ] Lint clean (0 errors)
- [ ] No `@ts-ignore`, `@ts-expect-error`, or `any` introduced
- [ ] All factories reset in `beforeEach()`
- [ ] Test naming follows conventions
- [ ] AAA pattern followed
- [ ] No local `createMock*` functions remaining

---

## Troubleshooting

### Tests Fail After Stage 1

**Debug Steps:**

1. **Compare Objects:**
```typescript
const user = createUser({ /* overrides */ });
console.log('Factory output:', JSON.stringify(user, null, 2));
```

2. **Check IDs:**
- Deterministic IDs used correctly?
- Is `resetAllFactories()` in `beforeEach()`?

3. **Check Optional Fields:**
```typescript
const user = createUser();
console.log(Object.keys(user)); // What fields present?
```

4. **Run Single Test:**
```bash
npm test -- path/to/file.test.ts -t "specific test name"
```

### Type Errors After Migration

**Common Causes:**

1. **Array Access Without Validation:**
```typescript
// ❌ Error
const item = array[0];

// ✅ Fix
const item = array[0];
expect(item).toBeDefined();
```

2. **Mock Call Access:**
```typescript
// ❌ Error
const arg = mockFn.mock.calls[0][0];

// ✅ Fix
const arg = mockFn.mock.calls[0]?.[0];
expect(arg).toBeDefined();
```

### Tests Flaky After Migration

**Likely Cause:** Missing `resetAllFactories()`

**Solution:**
```typescript
describe('Component', () => {
  beforeEach(() => {
    resetAllFactories(); // MUST have this!
  });
});
```

### Too Many Overrides in Stage 2

**Decision Process:**

1. **Ask:** "Does this test specifically care about this value?"
   - If YES → Keep override
   - If NO → Remove override

2. **Try Removing:**
   - Remove override
   - Run tests
   - If pass → Keep removed
   - If fail → Add back

---

## Summary

### Migration Process Overview

```
Baseline Check
     ↓
Stage 1: Preserve and Lock
  - Replace inline with factories
  - Heavy overrides (100% identical)
  - Validate tests pass
  - 0 NEW errors
  - Commit
     ↓
Stage 2: Refactor and Simplify
  - Remove unnecessary overrides
  - Use type-specific helpers
  - Validate tests pass
  - 0 errors total
  - Commit
     ↓
Final Validation
  - Tests ✅
  - Types ✅
  - Lint ✅
```

### Key Principles

1. **Two Stages:** Separate preserve from simplify
2. **One File at a Time:** Don't migrate multiple files in same commit
3. **Zero Errors:** MUST have 0 new errors
4. **Validate Continuously:** Run tests after every change
5. **Git History:** Clear commits show intent

### Quick Reference

```bash
# Stage 1: Preserve and Lock
npm run type-check > baseline.txt
npm test -- path/to/file.test.ts
# ... make changes ...
npm test -- path/to/file.test.ts
npm run type-check > stage1.txt
diff baseline.txt stage1.txt  # Must show 0 NEW errors
git commit -m "refactor: migrate [Name] to factories (preserve stage)"

# Stage 2: Refactor and Simplify
# ... simplify overrides ...
npm test -- path/to/file.test.ts
npm run type-check  # Must be 0 errors
npm run lint        # Must be 0 errors
git commit -m "refactor: simplify [Name] factory overrides"
```
