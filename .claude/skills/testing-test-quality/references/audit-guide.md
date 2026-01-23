# Test Audit Guide

Detailed reference for auditing test quality, categorizing issues, and assigning priorities.

## Mock Counting Rules

When auditing tests, count internal mocks to identify mock-heavy tests.

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

## Audit Issue Categories

When auditing tests, categorize issues using these codes:

### Issue Types

| Code | Name | Description | Severity |
|------|------|-------------|----------|
| `MOCK-HEAVY` | Mock-heavy | 3+ internal dependencies mocked | High |
| `IMPL-COUPLED` | Implementation-coupled | `toHaveBeenCalled`/`toHaveBeenCalledWith` on internal methods | Medium |
| `WEAK-ASSERT` | Weak assertions | `toBeTruthy()`/`toBeFalsy()` on specific values, meaningless `toMatchObject` | Medium |
| `MISSING-ASSERT` | Missing assertions | Tests with no `expect` statements | High |
| `CONDITIONAL-EXPECT` | Conditional expects | `if/else` around assertions | High |

### Issue Examples

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

## Priority Levels

When flagging tests for improvement, assign priority based on impact.

### Priority Definitions

| Priority | Criteria | Action |
|----------|----------|--------|
| **HIGH** | Mock-heavy unit tests that should be integration tests, OR tests with multiple issues | Convert to integration test or rewrite |
| **MEDIUM** | Single issue like impl-coupled assertions or weak assertions | Fix assertions in place |
| **LOW** | Minor style issues (hook ordering, formatting) | Fix opportunistically |
| **OK** | No issues found | No action needed |

### Priority Assignment Algorithm

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

## Audit Checklist

When reviewing a test file:

1. **Count internal mocks** — 3+ = MOCK-HEAVY
2. **Check assertions** — Look for `toHaveBeenCalled` on internal methods (IMPL-COUPLED)
3. **Evaluate assertion strength** — `toBeTruthy()` on specific values = WEAK-ASSERT
4. **Verify assertions exist** — No `expect` = MISSING-ASSERT
5. **Check for conditionals** — `if/else` around expects = CONDITIONAL-EXPECT
6. **Assign priority** — Use algorithm above
7. **Document recommendation** — Convert, refactor, or OK
