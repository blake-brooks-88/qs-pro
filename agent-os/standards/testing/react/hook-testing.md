# React Hook Testing

Test custom React hooks using `renderHook` from React Testing Library with proper state update handling.

---

## Core APIs

### `renderHook()` - Render Hook for Testing

```typescript
import { renderHook } from '@testing-library/react';

// Basic usage
const { result } = renderHook(() => useMyHook());

// With parameters
const { result } = renderHook(() => useMyHook(initialValue));

// With factory data
const entity = createEntityStub();
const { result } = renderHook(() => useEntityData(entity.id));
```

### `act()` - Handle State Updates

```typescript
import { act } from '@testing-library/react';

// Wrap state updates in act()
act(() => {
  result.current.increment();
});

// Multiple state updates
act(() => {
  result.current.increment();
  result.current.increment();
});
```

### `result.current` - Access Hook Return Values

```typescript
const { result } = renderHook(() => useCounter());

// Access returned values
expect(result.current.count).toBe(0);

// Access returned functions
act(() => {
  result.current.increment();
});
```

---

## Hook Testing Patterns

### Pattern 1: Testing State Management

```typescript
import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

describe('useCounter', () => {
  test('useCounter_OnIncrement_UpdatesCount', () => {
    // Arrange
    const { result } = renderHook(() => useCounter());

    // Act
    act(() => {
      result.current.increment();
    });

    // Assert
    expect(result.current.count).toBe(1);
  });

  test('useCounter_OnDecrement_UpdatesCount', () => {
    // Arrange
    const { result } = renderHook(() => useCounter(5));

    // Act
    act(() => {
      result.current.decrement();
    });

    // Assert
    expect(result.current.count).toBe(4);
  });
});
```

### Pattern 2: Testing Hook with Initial Parameters

```typescript
test('useCounter_WithInitialValue_StartsAtValue', () => {
  // Arrange & Act
  const { result } = renderHook(() => useCounter(10));

  // Assert
  expect(result.current.count).toBe(10);
});

test('useEntityData_WithEntityId_LoadsEntity', () => {
  // Arrange
  const entity = createEntityStub({ id: 'entity-123', name: 'Customer' });
  useEntityStore.setState({ entities: [entity] });

  // Act
  const { result } = renderHook(() => useEntityData('entity-123'));

  // Assert
  expect(result.current.entity).toBeDefined();
  expect(result.current.entity?.name).toBe('Customer');
});
```

### Pattern 3: Testing Multiple State Updates

```typescript
test('useCounter_OnMultipleIncrements_AccumulatesCount', () => {
  // Arrange
  const { result } = renderHook(() => useCounter());

  // Act
  act(() => {
    result.current.increment();
    result.current.increment();
    result.current.increment();
  });

  // Assert
  expect(result.current.count).toBe(3);
});
```

### Pattern 4: Testing Reset Functionality

```typescript
test('useCounter_OnReset_SetsCountToZero', () => {
  // Arrange
  const { result } = renderHook(() => useCounter(10));

  // Act - Modify then reset
  act(() => {
    result.current.increment();
    result.current.increment();
  });
  expect(result.current.count).toBe(12); // Verify modified

  act(() => {
    result.current.reset();
  });

  // Assert
  expect(result.current.count).toBe(0);
});
```

### Pattern 5: Testing Async Hooks

```typescript
test('useEntityData_OnFetch_LoadsEntityAsynchronously', async () => {
  // Arrange
  const entity = createEntityStub({ id: 'entity-123' });
  const { result } = renderHook(() => useEntityData('entity-123'));

  // Assert - Initial loading state
  expect(result.current.isLoading).toBe(true);
  expect(result.current.entity).toBeUndefined();

  // Act - Wait for async load
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  // Assert - Data loaded
  expect(result.current.entity).toBeDefined();
  expect(result.current.entity?.id).toBe('entity-123');
});
```

### Pattern 6: Testing Error States

```typescript
test('useEntityData_WithInvalidId_SetsErrorState', async () => {
  // Arrange
  const { result } = renderHook(() => useEntityData('invalid-id'));

  // Act - Wait for error
  await waitFor(() => {
    expect(result.current.isLoading).toBe(false);
  });

  // Assert
  expect(result.current.error).toBeDefined();
  expect(result.current.error?.message).toContain('Entity not found');
  expect(result.current.entity).toBeUndefined();
});
```

---

## Testing with Dependencies

### Pattern: Hook with Factory Data

```typescript
import { beforeEach } from 'vitest';
import { resetAllFactories, createEntityStub } from '@/test-utils/factories';

describe('useEntityValidator', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('useEntityValidator_WithValidEntity_ReturnsNoErrors', () => {
    // Arrange
    const entity = createEntityStub({
      name: 'Customer',
      fields: [createPKField()],
    });

    // Act
    const { result } = renderHook(() => useEntityValidator(entity));

    // Assert
    expect(result.current.isValid).toBe(true);
    expect(result.current.errors).toHaveLength(0);
  });

  test('useEntityValidator_WithEmptyFields_ReturnsError', () => {
    // Arrange
    const entity = createEntityStub({ fields: [] });

    // Act
    const { result } = renderHook(() => useEntityValidator(entity));

    // Assert
    expect(result.current.isValid).toBe(false);
    expect(result.current.errors).toContain('Entity must have at least one field');
  });
});
```

### Pattern: Hook with Store Integration

```typescript
test('useSelectedEntity_WithStoreSelection_ReturnsSelectedEntity', () => {
  // Arrange
  const entity = createEntityStub({ id: 'entity-123', name: 'Customer' });
  useEntityStore.setState({
    entities: [entity],
    selectedEntityId: 'entity-123',
  });

  // Act
  const { result } = renderHook(() => useSelectedEntity());

  // Assert
  expect(result.current).toBeDefined();
  expect(result.current?.id).toBe('entity-123');
  expect(result.current?.name).toBe('Customer');
});
```

---

## Testing Hook Rerendering

### Pattern: Update Props Between Renders

```typescript
test('useEntityData_WhenIdChanges_LoadsNewEntity', () => {
  // Arrange
  const entity1 = createEntityStub({ id: 'entity-1', name: 'Customer' });
  const entity2 = createEntityStub({ id: 'entity-2', name: 'Order' });
  useEntityStore.setState({ entities: [entity1, entity2] });

  // Initial render
  const { result, rerender } = renderHook(
    ({ id }) => useEntityData(id),
    { initialProps: { id: 'entity-1' } }
  );

  // Assert initial state
  expect(result.current.entity?.name).toBe('Customer');

  // Act - Rerender with new ID
  rerender({ id: 'entity-2' });

  // Assert updated state
  expect(result.current.entity?.name).toBe('Order');
});
```

---

## Complete Hook Test Example

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { resetAllFactories, createEntityStub } from '@/test-utils/factories';
import { useEntityForm } from './useEntityForm';

describe('useEntityForm', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('useEntityForm_OnInitialize_SetsDefaultValues', () => {
    // Arrange & Act
    const { result } = renderHook(() => useEntityForm());

    // Assert
    expect(result.current.values.name).toBe('');
    expect(result.current.values.type).toBe('dmo');
    expect(result.current.errors).toEqual({});
  });

  test('useEntityForm_OnFieldChange_UpdatesValue', () => {
    // Arrange
    const { result } = renderHook(() => useEntityForm());

    // Act
    act(() => {
      result.current.setFieldValue('name', 'Customer');
    });

    // Assert
    expect(result.current.values.name).toBe('Customer');
  });

  test('useEntityForm_OnValidation_SetsErrors', () => {
    // Arrange
    const { result } = renderHook(() => useEntityForm());

    // Act - Try to validate without required fields
    act(() => {
      result.current.validate();
    });

    // Assert
    expect(result.current.errors.name).toBe('Name is required');
  });

  test('useEntityForm_OnSubmit_CallsOnSave', async () => {
    // Arrange
    const mockOnSave = vi.fn();
    const { result } = renderHook(() => useEntityForm({ onSave: mockOnSave }));

    // Act - Fill form
    act(() => {
      result.current.setFieldValue('name', 'Customer');
    });

    // Act - Submit
    act(() => {
      result.current.submit();
    });

    // Assert
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledOnce();
    });
    expect(mockOnSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Customer' })
    );
  });

  test('useEntityForm_OnReset_ClearsValues', () => {
    // Arrange
    const { result } = renderHook(() => useEntityForm());

    // Act - Set values then reset
    act(() => {
      result.current.setFieldValue('name', 'Customer');
    });
    expect(result.current.values.name).toBe('Customer');

    act(() => {
      result.current.reset();
    });

    // Assert
    expect(result.current.values.name).toBe('');
  });
});
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Not Using act()

```typescript
// ❌ Bad - Missing act() wrapper
const { result } = renderHook(() => useCounter());
result.current.increment(); // Warning: state update not wrapped in act()
expect(result.current.count).toBe(1);

// ✅ Good - Wrapped in act()
const { result } = renderHook(() => useCounter());
act(() => {
  result.current.increment();
});
expect(result.current.count).toBe(1);
```

### ❌ Anti-Pattern 2: Testing Implementation Details

```typescript
// ❌ Bad - Testing internal state structure
expect(result.current._internalState).toBe(true);

// ✅ Good - Testing public API
expect(result.current.isActive).toBe(true);
```

### ❌ Anti-Pattern 3: Not Handling Async Operations

```typescript
// ❌ Bad - Not waiting for async
const { result } = renderHook(() => useEntityData('entity-123'));
expect(result.current.entity).toBeDefined(); // Fails - still loading

// ✅ Good - Using waitFor
const { result } = renderHook(() => useEntityData('entity-123'));
await waitFor(() => {
  expect(result.current.isLoading).toBe(false);
});
expect(result.current.entity).toBeDefined();
```

---

## Summary

### Essential APIs

- **`renderHook()`** - Render hook for testing
- **`act()`** - Wrap state updates
- **`result.current`** - Access hook return values
- **`rerender()`** - Update props between renders
- **`waitFor()`** - Wait for async operations

### Key Patterns

- Use `act()` for all state updates
- Use factories for test data parameters
- Test public API, not implementation details
- Use `waitFor()` for async operations
- Test initial state, updates, and reset functionality

### Quick Reference

```typescript
// Setup
const entity = createEntityStub();
const mockFn = vi.fn();

// Render hook
const { result, rerender } = renderHook(() => useMyHook(entity));

// Access values
expect(result.current.count).toBe(0);

// Update state
act(() => {
  result.current.increment();
});

// Async operations
await waitFor(() => {
  expect(result.current.isLoading).toBe(false);
});

// Rerender with new props
rerender({ id: 'new-id' });
```
