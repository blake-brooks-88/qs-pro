# Assertions & Validation

Core principles for what to test and how to assert outcomes across any language or framework.

## Behavioral vs Contract Testing

### Core Philosophy

| Test Type | Purpose | Data Source | Schema Coupling | Failure Behavior |
|-----------|---------|-------------|-----------------|------------------|
| **Behavioral** | Test what code DOES | Centralized factories | Should NOT fail on schema changes | Fails when behavior changes |
| **Contract** | Validate what code ACCEPTS | Inline objects | SHOULD fail on schema changes | Fails when schema changes |

### Behavioral Test Example

```typescript
// ✅ Tests what EntityCard DOES
describe('EntityCard - Behavioral', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('EntityCard_WithEntityName_DisplaysNameInHeading', () => {
    // Arrange - Factory (resilient to schema changes)
    const entity = createEntityStub({ name: 'Customer' });

    // Act
    render(<EntityCard entity={entity} />);

    // Assert - User-visible behavior
    expect(screen.getByRole('heading', { name: /customer/i })).toBeInTheDocument();
  });
});
```

**Key Characteristics:**
- Uses centralized factories
- Focuses on user-facing behavior
- Tests outcomes, not structure
- Remains valid when schema adds fields

### Contract Test Example

```typescript
// ✅ Validates Entity schema rules
describe('Entity Schema - Contracts', () => {
  test('entitySchema_WithValidData_Passes', () => {
    // Arrange - Inline object to test exact schema
    const validEntity = {
      id: 'entity-1',
      name: 'Customer',
      type: 'table', // Must be allowed type
      fields: [...],
    };

    // Act & Assert
    expect(() => entitySchema.parse(validEntity)).not.toThrow();
  });

  test('entitySchema_WithInvalidType_Throws', () => {
    // Arrange - Invalid to test schema enforcement
    const invalidEntity = {
      id: 'entity-1',
      name: 'Test',
      type: 'invalid-type', // Schema should reject
      fields: [],
    };

    // Act & Assert - SHOULD fail when schema changes
    expect(() => entitySchema.parse(invalidEntity)).toThrow(/type/i);
  });
});
```

**Key Characteristics:**
- Uses inline objects (COUPLED to schema)
- Tests schema validation directly
- SHOULD fail when schema changes
- Located in `schema-contracts.test.ts`

### Decision Matrix

```
┌─────────────────────────────────────────────────────────────┐
│ What am I testing?                                          │
├─────────────────────────────────────────────────────────────┤
│ Does component render correctly?            → Behavioral    │
│ Does function return expected result?       → Behavioral    │
│ Does service persist data?                  → Behavioral    │
│ Does state update correctly?                → Behavioral    │
│                                                              │
│ Does schema accept valid data?              → Contract      │
│ Does schema reject invalid data?            → Contract      │
│ Are enum values enforced?                   → Contract      │
│ Are type constraints validated?             → Contract      │
└─────────────────────────────────────────────────────────────┘
```

---

## What to Assert

### DO Assert: Observable Outcomes

✅ **User-Visible Elements**
```typescript
// Component rendering
expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
expect(screen.getByText(/welcome/i)).toBeVisible();
```

✅ **State Changes**
```typescript
// Store updates
expect(result.current.entities).toHaveLength(1);
expect(result.current.selectedEntity?.id).toBe('entity-1');

// Local state
expect(result.current.isLoading).toBe(true);
```

✅ **Side Effects**
```typescript
// Function calls
expect(mockCreate).toHaveBeenCalledOnce();
expect(mockCreate).toHaveBeenCalledWith('project-1', expect.objectContaining({
  name: 'Customer',
}));

// Storage operations
expect(localStorage.getItem('project-1')).toBeDefined();
```

✅ **Function Returns**
```typescript
// Return values
expect(result.success).toBe(true);
expect(result.data.id).toBe('entity-1');

// Errors
expect(result.error).toBeDefined();
expect(result.error.message).toContain('validation failed');
```

### DON'T Assert: Implementation Details

❌ **Internal Component State**
```typescript
// ❌ Bad - Testing internals
expect(component.state.internalCounter).toBe(5);

// ✅ Good - Observable behavior
expect(screen.getByText('Count: 5')).toBeInTheDocument();
```

❌ **Specific Component Structure**
```typescript
// ❌ Bad - Coupled to implementation
expect(container.querySelector('.entity-card__wrapper')).toBeInTheDocument();

// ✅ Good - Semantic structure
expect(screen.getByRole('article')).toBeInTheDocument();
```

❌ **Private Methods**
```typescript
// ❌ Bad - Testing private implementation
expect(service._privateHelper()).toBe(true);

// ✅ Good - Public API
const result = service.createEntity(entity);
expect(result.success).toBe(true);
```

❌ **Exact Object Structure (Unless Contract Test)**
```typescript
// ❌ Bad in behavioral test - Too coupled
expect(entity).toEqual({
  id: 'entity-1',
  name: 'Customer',
  fields: [...],
  // Breaks when adding optional fields
});

// ✅ Good - Test specific properties
expect(entity.name).toBe('Customer');
expect(entity.type).toBe('table');

// ✅ Also good - Partial match
expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
  name: 'Customer',
}));
```

---

## Assertion Patterns

### Pattern 1: Presence Assertions

```typescript
// Element exists
expect(screen.getByText(/welcome/i)).toBeInTheDocument();

// Element visible
expect(screen.getByRole('button')).toBeVisible();

// Element does NOT exist
expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
```

### Pattern 2: State Assertions

```typescript
// Disabled state
expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();

// Checked state
expect(screen.getByRole('checkbox')).toBeChecked();

// Input value
expect(screen.getByRole('textbox')).toHaveValue('Customer');
```

### Pattern 3: Attribute Assertions

```typescript
// ARIA attributes
expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'dialog-title');

// Data attributes
expect(screen.getByRole('button')).toHaveAttribute('data-loading', 'true');
```

### Pattern 4: Collection Assertions

```typescript
// Array length
expect(result.current.entities).toHaveLength(3);

// Array contains
expect(result.current.entities).toContainEqual(expect.objectContaining({
  name: 'Customer',
}));

// Multiple elements
const buttons = screen.getAllByRole('button');
expect(buttons).toHaveLength(2);
```

### Pattern 5: Object Assertions

```typescript
// Partial object match
expect(entity).toEqual(expect.objectContaining({
  name: 'Customer',
  type: 'table',
}));

// Nested property
expect(entity.position.x).toBe(100);

// Object shape
expect(result).toMatchObject({
  success: true,
  data: expect.any(Object),
});
```

---

## Edge Case Coverage

Every feature MUST test:

1. **Happy Path** - Normal, expected usage
2. **Empty/Null Cases** - Empty arrays, null values, missing optional fields
3. **Boundary Cases** - Min/max values, limits
4. **Error Cases** - Invalid inputs, failures, validation errors

### Happy Path Example

```typescript
test('createEntity_WithValidData_Persists', () => {
  // Arrange
  const entity = createEntityStub({ name: 'Customer' });

  // Act
  const result = service.createEntity('project-1', entity);

  // Assert
  expect(result).toBeDefined();
  expect(result.name).toBe('Customer');
});
```

### Empty/Null Cases

```typescript
test('EntityList_WithEmptyArray_DisplaysEmptyState', () => {
  // Arrange
  const entities: Entity[] = [];

  // Act
  render(<EntityList entities={entities} />);

  // Assert
  expect(screen.getByText(/no entities found/i)).toBeInTheDocument();
});

test('getEntity_WithNullId_ReturnsNull', () => {
  // Arrange
  const service = new EntityService();

  // Act
  const result = service.getEntity(null);

  // Assert
  expect(result).toBeNull();
});
```

### Boundary Cases

```typescript
describe('Entity Name Validation - Boundaries', () => {
  test('validateName_WithMinLength_Passes', () => {
    // Arrange - Min valid length
    const name = 'A';

    // Act
    const result = validateEntityName(name);

    // Assert
    expect(result.valid).toBe(true);
  });

  test('validateName_ExceedsMaxLength_Fails', () => {
    // Arrange - Over max
    const name = 'A'.repeat(101);

    // Act
    const result = validateEntityName(name);

    // Assert
    expect(result.valid).toBe(false);
    expect(result.error).toContain('maximum length');
  });
});
```

### Error Cases

```typescript
test('createEntity_WithDuplicateId_ThrowsError', () => {
  // Arrange
  const service = new EntityService();
  const entity1 = createEntityStub({ id: 'entity-1' });
  service.createEntity(entity1);

  // Act & Assert
  const entity2 = createEntityStub({ id: 'entity-1' });
  expect(() => service.createEntity(entity2)).toThrow(/duplicate/i);
});
```

### Parameterized Edge Cases

```typescript
describe('Field Type Validation - Edge Cases', () => {
  test.each([
    { type: '', expected: false },
    { type: null, expected: false },
    { type: undefined, expected: false },
    { type: 'INVALID', expected: false },
    { type: 'text', expected: true },
  ])('validateFieldType_With$type_Returns$expected', ({ type, expected }) => {
    const result = validateFieldType(type);
    expect(result).toBe(expected);
  });
});
```

---

## Mock Assertions

### Pattern 1: Function Call Assertions

```typescript
test('EntityForm_OnSubmit_CallsSaveHandler', async () => {
  // Arrange
  const mockOnSave = vi.fn();
  render(<EntityForm onSave={mockOnSave} />);

  // Act
  await user.click(screen.getByRole('button', { name: /submit/i }));

  // Assert
  expect(mockOnSave).toHaveBeenCalledOnce();
  expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Customer',
    type: 'table',
  }));
});
```

### Pattern 2: Call Order Assertions

```typescript
test('EntityService_CreateAndNotify_CallsInOrder', () => {
  // Arrange
  const mockCreate = vi.fn();
  const mockNotify = vi.fn();
  const service = new EntityService(mockCreate, mockNotify);

  // Act
  service.createAndNotify(createEntityStub());

  // Assert - Order matters
  expect(mockCreate).toHaveBeenCalled();
  expect(mockNotify).toHaveBeenCalled();
  expect(mockCreate.mock.invocationCallOrder[0]).toBeLessThan(
    mockNotify.mock.invocationCallOrder[0]
  );
});
```

### Pattern 3: Accessing Mock Call Arguments

```typescript
test('EntityModal_OnSave_PassesFormData', async () => {
  // Arrange
  const mockOnSave = vi.fn();
  render(<EntityModal onSave={mockOnSave} />);

  // Act
  await user.type(screen.getByLabelText(/name/i), 'Customer');
  await user.click(screen.getByRole('button', { name: /save/i }));

  // Assert - Access call arguments
  const savedEntity = mockOnSave.mock.calls[0]?.[0];
  expect(savedEntity).toBeDefined();
  expect(savedEntity?.name).toBe('Customer');
});
```

---

## Async Assertions

### Pattern 1: waitFor (Most Common)

```typescript
test('EntityList_AfterLoad_DisplaysEntities', async () => {
  // Arrange
  render(<EntityList />);

  // Assert - Wait for async operation
  await waitFor(() => {
    expect(screen.getByText(/customer/i)).toBeInTheDocument();
  });
});
```

### Pattern 2: findBy Queries (Shorthand)

```typescript
test('EntityList_AfterLoad_DisplaysEntities', async () => {
  // Arrange
  render(<EntityList />);

  // Assert - findBy waits automatically
  expect(await screen.findByText(/customer/i)).toBeInTheDocument();
});
```

### Pattern 3: Hook Testing with waitFor

```typescript
test('useProjectData_OnMount_FetchesProject', async () => {
  // Arrange
  const mockProject = createProjectStub();

  // Act
  const { result } = renderHook(() => useProjectData('project-1'));

  // Assert
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(mockProject);
});
```

---

## Confidence Levels

Different test types provide different confidence levels:

| Test Type | Confidence | Speed | Cost | Use When |
|-----------|-----------|-------|------|----------|
| Unit | Low-Medium | Fast | Low | Testing logic, utilities |
| Integration | Medium-High | Medium | Medium | Testing feature workflows |
| E2E | High | Slow | High | Critical user paths only |

**Strategy:** Prioritize integration tests for most features, unit tests for complex logic, E2E tests sparingly.

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Testing Implementation Details

```typescript
// ❌ Bad - Internal state
expect(component.state.counter).toBe(5);

// ✅ Good - Observable behavior
expect(screen.getByText('Count: 5')).toBeInTheDocument();
```

### ❌ Anti-Pattern 2: Over-Specific Assertions

```typescript
// ❌ Bad - Too specific
expect(entity).toEqual({
  id: 'entity-1',
  name: 'Customer',
  // Every single field...
});

// ✅ Good - Assert what matters
expect(entity.name).toBe('Customer');
expect(entity.type).toBe('table');
```

### ❌ Anti-Pattern 3: Not Testing Edge Cases

```typescript
// ❌ Bad - Only happy path
test('render with entity', () => {
  const entity = createEntityStub();
  render(<EntityCard entity={entity} />);
  expect(screen.getByText(entity.name)).toBeInTheDocument();
});

// ✅ Good - Also test edge cases
test('render with empty fields array', () => {
  const entity = createEntityStub({ fields: [] });
  render(<EntityCard entity={entity} />);
  expect(screen.getByText(/no fields/i)).toBeInTheDocument();
});
```

### ❌ Anti-Pattern 4: Asserting Negative Cases Without Reason

```typescript
// ❌ Bad - Doesn't prove anything
const mockFn = vi.fn();
// ... code that doesn't call mockFn ...
expect(mockFn).not.toHaveBeenCalled();

// ✅ Good - Assert positive behavior
const mockFn = vi.fn();
// ... code that SHOULD call mockFn ...
expect(mockFn).toHaveBeenCalledOnce();
```

---

## Summary

### Key Principles

1. **Behavioral vs Contract:** Use factories for behavioral tests, inline objects for contracts
2. **What to Assert:** Observable outcomes (UI, state, side effects), not implementation
3. **Edge Cases:** MUST cover happy path, empty/null, boundaries, errors
4. **Mock Assertions:** Verify calls, arguments, order for side effects
5. **Async Patterns:** Use `waitFor` or `findBy` for async operations
6. **Confidence Levels:** Balance unit/integration/E2E based on cost and value

### Quick Reference

```typescript
// Behavioral Test
describe('EntityCard - Behavioral', () => {
  beforeEach(() => {
    resetAllFactories();
  });

  test('EntityCard_WithEntityName_DisplaysName', () => {
    // Arrange - Factory
    const entity = createEntityStub({ name: 'Customer' });

    // Act
    render(<EntityCard entity={entity} />);

    // Assert - User-facing behavior
    expect(screen.getByRole('heading', { name: /customer/i })).toBeInTheDocument();
  });
});

// Contract Test
describe('Entity Schema - Contracts', () => {
  test('entitySchema_WithInvalidType_Throws', () => {
    // Arrange - Inline object
    const invalid = { type: 'invalid', ...otherFields };

    // Assert - Schema validation
    expect(() => entitySchema.parse(invalid)).toThrow();
  });
});
```
