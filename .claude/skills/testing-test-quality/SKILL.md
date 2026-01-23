---
name: Test Quality Standards
description: This skill should be used when writing tests, creating test files, modifying existing tests, reviewing test code, adding assertions, mocking dependencies, or working with any .test.ts, .spec.ts, test/, __tests__/, or spec/ files. It provides quality criteria to ensure tests validate behavior (not implementation), survive refactors, and avoid common anti-patterns like mock-heavy tests, weak assertions, and implementation coupling.
---

## When to Use

- Writing new unit, integration, or e2e tests
- Modifying or refactoring existing tests
- Reviewing test code in PRs
- Adding assertions or expectations
- Deciding what/how to mock
- Evaluating test quality during audits
- Working with `.test.ts`, `.spec.ts`, `__tests__/`, `tests/`, or `spec/` files

# Test Quality Standards

## Testing Philosophy

> "Validate actual application behavior with high quality tests that do not test implementation details and will survive a refactor. No overly mocked tests. No vanity coverage. No bogus assertions. Bad tests are tech debt—if a refactor breaks tests, it should reveal an actual bug, not brittle coupling."

**Goals for every test:**
1. **Validate actual behavior** - Not implementation details
2. **Survive refactors** - Only fail when behavior changes
3. **Provide confidence** - Enable fearless code changes
4. **Minimize maintenance** - Not brittle to internal changes

## Quality Markers

### Good Tests

| Marker | Description |
|--------|-------------|
| **Tests observable behavior** | Assert on outputs and side effects, not internal method calls |
| **Survives refactors** | Renaming variables or extracting methods doesn't break tests |
| **Uses real dependencies** | Real database, real internal services where feasible |
| **Mocks only external boundaries** | MCE API, HTTP calls, time, randomness |
| **Meaningful assertions** | `expect(user.email).toBe('test@example.com')` not `expect(user).toBeTruthy()` |
| **One condition per assertion** | Separate expects for status, body, headers |

### Bad Tests (Flag for Improvement)

| Marker | Issue | Impact |
|--------|-------|--------|
| **Mock-heavy** | 3+ internal dependencies mocked | Doesn't validate real integration; breaks on refactor |
| **Implementation-coupled** | `toHaveBeenCalled` on internal methods | Breaks when structure changes, even if behavior correct |
| **Weak assertions** | `toBeTruthy()`/`toBeFalsy()` on specific values | Passes even when behavior is wrong |
| **Missing assertions** | Tests with no `expect` statements | Zero validation |
| **Conditional expects** | `if/else` around assertions | May not execute; unpredictable coverage |

## Test Type Guidelines

### Unit Tests — Pure Business Logic Only

**Good for:** Data transformations, validation functions, calculation logic, state machines

**Bad for:** Service methods with DB calls, controller handlers, repository methods, anything with DI

**Characteristics:**
- Zero or minimal mocks (only external boundaries)
- Fast execution (milliseconds)
- No infrastructure dependencies

### Integration Tests — Primary Coverage Strategy

**Good for:** HTTP handlers, service→repository flows, full request/response cycles, DB operations

**Bad for:** Pure calculation functions, isolated utilities, third-party API interactions (use stubs)

**Characteristics:**
- Full stack: Controller → Service → Repository → Real DB
- Real Postgres and Redis (`docker-compose up -d`)
- Mock only external boundaries (MCE API, email, etc.)
- Let NestJS DI wire real services

### E2E Tests — Critical Journeys Only (3-10 tests)

**Good for:** Auth flow, query execution, session management

**Bad for:** Every API endpoint, edge cases, validation errors

**Characteristics:**
- Full application stack
- Realistic external stubs
- High confidence, high maintenance cost

## Mocking Rules

### Mock Only External Boundaries

**External (OK to mock):**
- HTTP calls (MSW, nock)
- Time (`vi.useFakeTimers()`)
- Randomness (`vi.spyOn(Math, 'random')`)
- MCE API (SOAP/REST responses)

**Internal (Avoid mocking):**
- Services (AuthService, UserService)
- Repositories (UserRepository)
- ConfigService
- Internal utilities

### Mock-Heavy Threshold: 3+ Internal Mocks

A test with 3+ internal dependencies mocked is likely:
- Testing implementation details rather than behavior
- Better suited as an integration test
- At high risk of breaking during refactors

## Coverage Philosophy

### Delta Coverage (New Code)

**Target:** 90%+ line coverage on new/changed code
- Enforced via `vitest-coverage-report-action` in CI
- Applies to all PRs

### Existing Code

**Approach:** Diagnostic tool, not vanity metric
- Use coverage to identify gaps, not chase percentages
- No forced tests to hit arbitrary thresholds
- Human judgment on uncovered lines matters more

### Quality Over Quantity

1. **No vanity tests** — A test that can't fail is worthless
2. **No bogus assertions** — `expect(true).toBe(true)` adds nothing
3. **Coverage is a symptom** — Low coverage indicates missing tests; high coverage doesn't guarantee quality

## ESLint Enforcement

### Error-Level Rules (Must Fix)

| Rule | Purpose |
|------|---------|
| `vitest/expect-expect` | Every test must have at least one assertion |
| `vitest/no-conditional-expect` | No `if/else` around `expect` statements |
| `vitest/no-focused-tests` | No `.only` in committed code |
| `vitest/no-identical-title` | Test names must be unique |
| `vitest/no-duplicate-hooks` | No duplicate `beforeEach`/`afterEach` |

### Warning-Level Rules (Should Fix)

| Rule | Purpose |
|------|---------|
| `vitest/no-disabled-tests` | Tracks skipped tests (`.skip`) |
| `vitest/prefer-hooks-in-order` | `beforeAll` → `beforeEach` → `afterEach` → `afterAll` |
| `vitest/prefer-hooks-on-top` | Hooks before test cases |
| `vitest/prefer-to-be` | Use `toBe()` for primitives |
| `vitest/prefer-to-have-length` | Use `toHaveLength()` for arrays |

## Quick Reference: Good vs Bad

```typescript
// BAD: Mock-heavy, implementation-coupled
const mockUserService = { findById: vi.fn() };
const mockAuthService = { validateToken: vi.fn() };
const mockConfigService = { get: vi.fn() };
expect(mockUserRepository.save).toHaveBeenCalledWith(expectedUser);

// GOOD: Test observable behavior
const response = await request(app).post('/users').send(userData);
expect(response.status).toBe(201);
expect(response.body.user.email).toBe('test@example.com');
```

```typescript
// BAD: Weak assertion
expect(user).toBeTruthy();

// GOOD: Specific assertion
expect(user.email).toBe('test@example.com');
expect(user.role).toBe('admin');
```

```typescript
// BAD: Conditional expect
if (process.env.NODE_ENV === 'test') {
  expect(result).toBe(expected);
}

// GOOD: Unconditional
expect(result).toBe(expected);
```

## Additional Resources

For detailed audit categories, priority levels, and mock counting rules, consult:
- **`references/audit-guide.md`** — Issue codes, severity levels, priority assignment algorithm
