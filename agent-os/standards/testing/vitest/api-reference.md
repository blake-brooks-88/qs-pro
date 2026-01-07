# Vitest API Quick Reference

Essential Vitest APIs for test organization, assertions, and mocking.

---

## Test Organization

### Test Suites and Cases

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

// Test suite
describe('MyComponent', () => {
  // Setup before each test
  beforeEach(() => {
    resetAllFactories();
    vi.clearAllMocks();
  });

  // Cleanup after each test
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Individual test
  test('MyComponent_WithProp_DisplaysValue', () => {
    expect(true).toBe(true);
  });
});
```

### Setup and Teardown Hooks

```typescript
beforeEach(() => {})   // Run before each test
afterEach(() => {})    // Run after each test
beforeAll(() => {})    // Run once before all tests
afterAll(() => {})     // Run once after all tests
```

---

## Assertions

### Common Matchers

```typescript
// Equality
expect(value).toBe(5);                    // Strict equality (===)
expect(value).toEqual({ id: '1' });       // Deep equality

// Truthiness
expect(value).toBeTruthy();
expect(value).toBeFalsy();
expect(value).toBeDefined();
expect(value).toBeUndefined();
expect(value).toBeNull();

// Numbers
expect(count).toBeGreaterThan(5);
expect(count).toBeGreaterThanOrEqual(5);
expect(count).toBeLessThan(10);
expect(count).toBeLessThanOrEqual(10);

// Strings
expect(text).toContain('substring');
expect(text).toMatch(/pattern/i);

// Arrays
expect(array).toHaveLength(3);
expect(array).toContain(item);
expect(array).toEqual(expect.arrayContaining([1, 2]));

// Objects
expect(obj).toHaveProperty('name');
expect(obj).toEqual(expect.objectContaining({ id: '1' }));

// Negation
expect(value).not.toBe(false);
```

---

## Mocking with vi

### Mock Functions

```typescript
import { vi } from 'vitest';

// Create mock function
const mockFn = vi.fn();

// Mock with return value
const mockFn = vi.fn().mockReturnValue(42);

// Mock with resolved promise
const mockFn = vi.fn().mockResolvedValue(data);

// Mock with rejected promise
const mockFn = vi.fn().mockRejectedValue(new Error('Failed'));

// Mock implementation
const mockFn = vi.fn((x) => x * 2);
```

### Mock Assertions

```typescript
// Call count
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledOnce();
expect(mockFn).toHaveBeenCalledTimes(3);
expect(mockFn).not.toHaveBeenCalled();

// Call arguments
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenLastCalledWith(arg1, arg2);

// Access call data
const firstCall = mockFn.mock.calls[0];     // Array of arguments
const firstArg = mockFn.mock.calls[0]?.[0]; // First argument of first call
const result = mockFn.mock.results[0];      // Return value of first call
```

### Module Mocking

```typescript
// Mock entire module
vi.mock('@/lib/storage/LocalStorageService', () => ({
  LocalStorageService: vi.fn().mockImplementation(() => ({
    getProjects: vi.fn(),
    createProject: vi.fn(),
  })),
}));

// Mock with partial implementation
vi.mock('reactflow', () => ({
  ...vi.importActual('reactflow'),
  useReactFlow: vi.fn(() => ({
    getNode: vi.fn(),
  })),
}));

// Get mocked module
import { LocalStorageService } from '@/lib/storage/LocalStorageService';
const mockService = vi.mocked(LocalStorageService);
```

### Mock Cleanup

```typescript
// Clear all mocks (reset call history and results)
vi.clearAllMocks();

// Reset all mocks (clear + reset implementation)
vi.resetAllMocks();

// Restore all mocks (reset + restore original implementation)
vi.restoreAllMocks();

// Best practice: use in beforeEach
beforeEach(() => {
  vi.clearAllMocks(); // Clear call history between tests
});
```

---

## React Testing Library Matchers

Additional matchers from `@testing-library/jest-dom`:

```typescript
// Element queries
expect(element).toBeInTheDocument();
expect(element).toBeVisible();
expect(element).toBeEmptyDOMElement();

// Form elements
expect(input).toHaveValue('text');
expect(checkbox).toBeChecked();
expect(button).toBeDisabled();
expect(button).toBeEnabled();

// Attributes
expect(element).toHaveAttribute('aria-label', 'Close');
expect(element).toHaveClass('btn-primary');

// Text content
expect(element).toHaveTextContent('Hello');
expect(element).toContainHTML('<span>Hello</span>');
```

---

## Quick Reference

### Test Structure

```typescript
describe('Component/Hook/Function', () => {
  beforeEach(() => {
    resetAllFactories();
    vi.clearAllMocks();
  });

  test('Name_State_Behavior', () => {
    // Arrange
    const data = createStub();
    const mockFn = vi.fn();

    // Act
    const result = doSomething(data);

    // Assert
    expect(result).toBeDefined();
    expect(mockFn).toHaveBeenCalledOnce();
  });
});
```

### Common Patterns

```typescript
// Mock function
const mockFn = vi.fn();
expect(mockFn).toHaveBeenCalledWith(expectedArg);

// Mock return value
const mockFn = vi.fn().mockReturnValue(42);

// Mock async
const mockFn = vi.fn().mockResolvedValue(data);

// Access mock calls
const arg = mockFn.mock.calls[0]?.[0];
expect(arg).toBeDefined();

// Partial object matching
expect(mockFn).toHaveBeenCalledWith(
  expect.objectContaining({ id: '1' })
);
```

---

## Summary

### Essential Imports

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

### Essential APIs

- **Test Organization:** `describe`, `test`, `beforeEach`, `afterEach`
- **Assertions:** `expect(...).toBe()`, `toEqual()`, `toHaveBeenCalled()`
- **Mocking:** `vi.fn()`, `vi.mock()`, `vi.clearAllMocks()`
- **RTL Matchers:** `toBeInTheDocument()`, `toHaveValue()`, `toBeDisabled()`

### Best Practices

- Use `vi.clearAllMocks()` in `beforeEach()`
- Use `resetAllFactories()` when using factories
- Validate mock calls with optional chaining: `mock.calls[0]?.[0]`
- Use `expect.objectContaining()` for partial matches
