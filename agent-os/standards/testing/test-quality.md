# Test Quality Standards

This document establishes criteria for evaluating test quality across the qs-pro monorepo. It serves as the reference for test audits and code reviews.

**Related documents:**
- [test-infrastructure.md](./test-infrastructure.md) - Test setup and configuration
- [test-writing.md](./test-writing.md) - Test writing guidelines
- [TEST-AUDIT-INVENTORY.md](../../.planning/phases/01.4-test-quality-improvements/TEST-AUDIT-INVENTORY.md) - Comprehensive test audit

## 1. Overview

### Purpose

This document defines what makes a test "good" or "bad" to ensure consistent evaluation during audits and code reviews. The goal is to produce tests that:

1. **Validate actual behavior** - Not implementation details
2. **Survive refactors** - Only fail when behavior changes
3. **Provide confidence** - Enable fearless code changes
4. **Minimize maintenance burden** - Not brittle to internal changes

### Testing Philosophy

> "My goal for tests is this: validate actual application behavior with high quality tests that do not test implementation details and with tests that will survive a refactor. I do not want overly mocked tests that provide little to no value. I do not want vanity coverage. I do not want bogus tests that have bad assertions. I view bad tests as tech debt because if I make a refactor to business logic, I don't want tests to fail because they were brittle. If they fail, I want it to reveal that a change in the business logic would actually cause a bug or something downstream to not work."

This philosophy drives all quality criteria in this document.

## 2. Quality Criteria

### Good Test Markers

Tests should demonstrate these characteristics:

| Marker | Description | Example |
|--------|-------------|---------|
| **Tests observable behavior** | Asserts on outputs and side effects, not how code works internally | `expect(response.status).toBe(200)` vs `expect(internalMethod).toHaveBeenCalled()` |
| **Survives internal refactors** | Only fails when actual behavior changes | Changing variable names or extracting methods doesn't break tests |
| **Uses real dependencies where feasible** | Real database, real internal services | Integration tests with Postgres instead of mock DB |
| **Mocks only external boundaries** | MCE API, network calls, time, randomness | MSW handlers for HTTP, `vi.useFakeTimers()` for time |
| **Has meaningful assertions** | Assertions that would fail if behavior is broken | `expect(user.email).toBe('test@example.com')` vs `expect(user).toBeTruthy()` |
| **One condition per assertion** | Each expect tests one specific thing | Separate expects for status, body, headers |

### Bad Test Markers (Flag for Improvement)

Tests exhibiting these patterns should be flagged for improvement:

| Marker | Issue | Impact |
|--------|-------|--------|
| **Mock-heavy** | 3+ internal dependencies mocked | Test doesn't validate real integration; breaks on any refactor |
| **Implementation-coupled** | `toHaveBeenCalled` on internal methods | Test breaks when internal structure changes, even if behavior is correct |
| **Weak assertions** | `toBeTruthy()`/`toBeFalsy()` on specific values | Test passes even when behavior is wrong |
| **Missing assertions** | Tests with no `expect` statements | Test provides zero validation |
| **Conditional expects** | `if/else` around assertions | Test may not execute assertions; unpredictable coverage |

## 3. Mock Counting Rules

When auditing tests, count internal mocks to identify mock-heavy tests:

### Internal Mocks (Count These)

| Type | Examples | Why It Counts |
|------|----------|---------------|
| Service mocks | `vi.fn()` for AuthService, UserService | Could use real service in integration test |
| Repository mocks | Mock objects for UserRepository | Could use real DB in integration test |
| ConfigService mock | `get: vi.fn()` for ConfigService | Could use real ConfigModule with test env vars |
| Internal utility mocks | Mocking internal helpers/utils | Could let real code run |

### External Mocks (Don't Count These)

| Type | Examples | Why It's External |
|------|----------|-------------------|
| HTTP calls | MSW handlers, `nock` | External network boundary |
| Time | `vi.useFakeTimers()` | Non-deterministic external |
| Randomness | `vi.spyOn(Math, 'random')` | Non-deterministic external |
| MCE API | Mock SOAP/REST responses | Third-party API boundary |

### Mock-Heavy Threshold

**3+ internal mocks = Mock-heavy**

A test with 3 or more internal dependencies mocked is likely:
- Testing implementation details rather than behavior
- Better suited as an integration test with real dependencies
- At high risk of breaking during refactors

## 4. Test Type Guidelines

### Unit Tests

**When to use:** Pure business logic only

| Good For | Bad For |
|----------|---------|
| Data transformations | Service methods wiring DB calls |
| Validation functions | Controller handlers |
| Calculation logic | Repository methods |
| State machines | Anything with DI dependencies |

**Characteristics:**
- Zero or minimal mocks (only external boundaries)
- Fast execution (milliseconds)
- No infrastructure dependencies

### Integration Tests (Primary Coverage Strategy)

**When to use:** Most application code

| Good For | Bad For |
|----------|---------|
| HTTP route handlers | Pure calculation functions |
| Service → Repository flows | Isolated utility functions |
| Full request/response cycles | Third-party API interactions (use stubs) |
| Database operations | Time-sensitive operations (use fake timers) |

**Characteristics:**
- Full stack: Controller → Service → Repository → Real DB
- Real Postgres and Redis (`docker-compose up -d`)
- Mock only at external boundaries (MCE API, email, etc.)
- Let NestJS DI wire real services

### E2E Tests

**When to use:** Critical user journeys only (3-10 tests)

| Good For | Bad For |
|----------|---------|
| Auth flow | Every API endpoint |
| Query execution | Edge cases |
| Session management | Validation errors |

**Characteristics:**
- Full application stack
- Realistic external stubs
- High confidence, high maintenance cost

## 5. ESLint Rules Reference

The `@vitest/eslint-plugin` enforces test quality via static analysis.

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

**Configuration:** See `packages/eslint-config/index.js` (Plan 01.4-01)

## 6. Coverage Philosophy

### Delta Coverage (New Code)

**Target:** 90%+ line coverage on new/changed code

- Enforced via `vitest-coverage-report-action` in CI
- Applies to all PRs
- Ensures new code is well-tested

### Existing Code Coverage

**Approach:** Diagnostic tool, not vanity metric

- Use coverage to identify gaps, not to chase percentages
- No forced tests to hit arbitrary thresholds
- Human judgment on uncovered lines more important than numbers

### Quality Over Quantity

**Principles:**

1. **No vanity tests** - A test that can't fail is worthless
2. **No bogus assertions** - `expect(true).toBe(true)` adds nothing
3. **Coverage is a symptom** - Low coverage indicates missing tests, high coverage doesn't guarantee quality

## 7. Audit Categories

When auditing tests, categorize issues using these codes:

### Issue Types

| Code | Name | Description | Severity |
|------|------|-------------|----------|
| `MOCK-HEAVY` | Mock-heavy | 3+ internal dependencies mocked | High |
| `IMPL-COUPLED` | Implementation-coupled | `toHaveBeenCalled`/`toHaveBeenCalledWith` on internal methods | Medium |
| `WEAK-ASSERT` | Weak assertions | `toBeTruthy()`/`toBeFalsy()` on specific values, meaningless `toMatchObject` | Medium |
| `MISSING-ASSERT` | Missing assertions | Tests with no `expect` statements | High |
| `CONDITIONAL-EXPECT` | Conditional expects | `if/else` around assertions | High |

### Examples

**MOCK-HEAVY:**
```typescript
// Bad: 4 internal mocks
const mockUserService = { findById: vi.fn() };
const mockAuthService = { validateToken: vi.fn() };
const mockConfigService = { get: vi.fn() };
const mockCacheService = { get: vi.fn(), set: vi.fn() };
```

**IMPL-COUPLED:**
```typescript
// Bad: Testing implementation, not behavior
expect(mockUserRepository.save).toHaveBeenCalledWith(expectedUser);
// Better: Test the actual result
expect(response.body.user.email).toBe('test@example.com');
```

**WEAK-ASSERT:**
```typescript
// Bad: Passes even if user is wrong type
expect(user).toBeTruthy();
// Better: Specific assertions
expect(user.email).toBe('test@example.com');
expect(user.role).toBe('admin');
```

**CONDITIONAL-EXPECT:**
```typescript
// Bad: May not execute assertion
if (process.env.NODE_ENV === 'test') {
  expect(result).toBe(expected);
}
// Better: Unconditional assertion
expect(result).toBe(expected);
```

## 8. Priority Levels

When flagging tests for improvement, assign priority based on impact:

### Priority Definitions

| Priority | Criteria | Action |
|----------|----------|--------|
| **HIGH** | Mock-heavy unit tests that should be integration tests, OR tests with multiple issues | Convert to integration test or rewrite |
| **MEDIUM** | Single issue like impl-coupled assertions or weak assertions | Fix assertions in place |
| **LOW** | Minor style issues (hook ordering, formatting) | Fix opportunistically |
| **OK** | No issues found | No action needed |

### Priority Assignment Guide

```
If (internal mocks >= 3 AND test type == unit):
  → HIGH (should be integration test)

If (issues.count >= 2):
  → HIGH (multiple problems)

If (issues.includes(MISSING-ASSERT) OR issues.includes(CONDITIONAL-EXPECT)):
  → HIGH (fundamentally broken)

If (issues.includes(IMPL-COUPLED) OR issues.includes(WEAK-ASSERT)):
  → MEDIUM (fixable in place)

If (issues.count == 0):
  → OK

Else:
  → LOW
```

### Recommended Actions by Priority

| Priority | Recommended Action |
|----------|-------------------|
| HIGH | Convert to integration test, or rewrite test approach entirely |
| MEDIUM | Refactor assertions to test behavior, not implementation |
| LOW | Fix during regular maintenance |
| OK | No action required |

---

*Standards established: 2026-01-23*
*Reference: Phase 01.4-test-quality-improvements*
