# Test Structure and Naming Standards

## Naming Convention (Mandatory)

### Pattern
```
MethodName_StateUnderTest_ExpectedBehavior
    ↓           ↓                ↓
  What?       When?           Then What?
```

### Examples

| Type | Good Example | What It Tests |
|------|--------------|---------------|
| Component | `EntityCard_WithEntityName_DisplaysNameInHeading` | Renders name in heading |
| Service | `createEntity_WithValidData_PersistsToStorage` | Saves entity successfully |
| Hook | `useEntityStore_OnAddEntity_UpdatesEntitiesArray` | Hook updates state |
| Error | `validateSchema_WithInvalidType_ThrowsValidationError` | Throws on invalid input |

### Bad Examples

| ❌ Bad | Why It's Bad | ✅ Better |
|--------|-------------|----------|
| `should work` | Vague, no context | `createEntity_WithValidData_PersistsToStorage` |
| `renders correctly` | What is "correctly"? | `EntityCard_WithEntityName_DisplaysNameInHeading` |
| `test user login` | Not descriptive | `login_WithValidCredentials_ReturnsUserToken` |
| `it handles errors` | Which errors? | `validateSchema_WithInvalidType_ThrowsValidationError` |

### Special Cases

**Components:**
```typescript
✅ EntityCard_WithEntityName_DisplaysNameInHeading
✅ EntityModal_OnSubmit_CallsOnSaveHandler
✅ EntityList_WithEmptyArray_DisplaysEmptyState
```

**Hooks:**
```typescript
✅ useEntityStore_OnAddEntity_UpdatesEntitiesArray
✅ useProjects_WhenFetching_ReturnsLoadingState
✅ useEntityActions_OnDelete_InvalidatesQueries
```

**Builders:**
```typescript
✅ RelationshipBuilder_WithSingleEntity_CreatesOneRelationship
✅ Builder_WithMultipleEntities_CreatesMultipleRelationships
```

---

## AAA Pattern (Mandatory)

### Structure
Every test must follow the Arrange-Act-Assert pattern with clear comment blocks:

```typescript
test('MethodName_StateUnderTest_ExpectedBehavior', () => {
  // Arrange - Set up test data, mocks, and dependencies

  // Act - Perform the single action being tested

  // Assert - Verify the expected outcome
})
```

### Example 1: Service Test

```typescript
test('createEntity_WithValidData_PersistsToStorage', () => {
  // Arrange
  const service = new LocalStorageService()
  const entity = createDMOStub({ name: 'Customer' })

  // Act
  const result = service.createEntity('project-1', entity)

  // Assert
  expect(result).toBeDefined()
  expect(result.name).toBe('Customer')
  expect(localStorage.getItem('project-1')).toBeDefined()
})
```

### Example 2: Component Test with User Interaction

```typescript
test('EntityModal_OnSubmit_CallsOnSaveHandler', async () => {
  // Arrange
  const user = userEvent.setup()
  const mockOnSave = vi.fn()
  const entity = createDMOStub({ name: 'Test Entity' })
  render(<EntityModal entity={entity} onSave={mockOnSave} isOpen={true} />)

  // Act
  const submitButton = screen.getByRole('button', { name: /save/i })
  await user.click(submitButton)

  // Assert
  expect(mockOnSave).toHaveBeenCalledOnce()
  expect(mockOnSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Test Entity'
    })
  )
})
```

### Guidelines

**Arrange:**
- Set up test data using factories
- Create mocks with `vi.fn()`
- Render components if needed
- Should be most of your test code

**Act:**
- **ONE action only** (1-3 lines max)
- Click a button, call a function, trigger an event
- This is the behavior being tested

**Assert:**
- Verify expected outcome
- Multiple assertions OK if testing same outcome
- Check both positive and edge cases

---

## Single Act Rule (Mandatory)

### Rule
**ONE Action Per Test.** If you have multiple actions, split into multiple tests.

### ✅ Good Example

```typescript
test('SaveButton_OnClick_CallsSaveHandler', async () => {
  // Arrange
  const user = userEvent.setup()
  const mockSave = vi.fn()
  render(<SaveButton onSave={mockSave} />)

  // Act - Single action: click
  await user.click(screen.getByRole('button', { name: /save/i }))

  // Assert
  expect(mockSave).toHaveBeenCalledOnce()
})
```

### ❌ Bad Example (Multiple Acts)

```typescript
// ❌ Testing TWO actions: type AND click
test('Form_OnSubmit_SavesData', async () => {
  const user = userEvent.setup()
  const mockSave = vi.fn()
  render(<Form onSave={mockSave} />)

  // Act - TWO actions (bad!)
  await user.type(screen.getByLabelText(/name/i), 'Test Name')
  await user.click(screen.getByRole('button', { name: /submit/i }))

  expect(mockSave).toHaveBeenCalledWith({ name: 'Test Name' })
})
```

### ✅ Solution: Split Into Separate Tests

```typescript
test('Form_OnSubmit_CallsSaveHandlerWithFormData', async () => {
  const user = userEvent.setup()
  const mockSave = vi.fn()
  render(<Form onSave={mockSave} initialValues={{ name: 'Test Name' }} />)

  // Act - Single action: click submit
  await user.click(screen.getByRole('button', { name: /submit/i }))

  // Assert
  expect(mockSave).toHaveBeenCalledWith({ name: 'Test Name' })
})

test('NameInput_OnChange_UpdatesFormValue', async () => {
  const user = userEvent.setup()
  const mockChange = vi.fn()
  render(<Form onChange={mockChange} />)

  // Act - Single action: type
  await user.type(screen.getByLabelText(/name/i), 'Test Name')

  // Assert
  expect(mockChange).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Test Name' })
  )
})
```

### Why Single Act Matters
- **Clarity:** Easy to see what behavior is being tested
- **Debugging:** When test fails, you know exactly which action failed
- **Isolation:** Tests don't depend on each other
- **Maintainability:** Changes to one behavior don't break unrelated tests

---

## Describe Block Organization

### When to Use
Group related tests together for better organization.

### Pattern 1: Organize by Method

```typescript
describe('EntityService', () => {
  beforeEach(() => {
    resetAllFactories()
  })

  describe('createEntity', () => {
    test('createEntity_WithValidData_PersistsToStorage', () => {})
    test('createEntity_WithDuplicateId_ThrowsError', () => {})
    test('createEntity_WithInvalidSchema_ThrowsValidationError', () => {})
  })

  describe('getEntity', () => {
    test('getEntity_WithExistingId_ReturnsEntity', () => {})
    test('getEntity_WithNonExistentId_ReturnsNull', () => {})
  })

  describe('deleteEntity', () => {
    test('deleteEntity_WithExistingId_RemovesFromStorage', () => {})
    test('deleteEntity_WithNonExistentId_ThrowsError', () => {})
  })
})
```

### Pattern 2: Organize by Feature Area

```typescript
describe('EntityModal', () => {
  describe('Rendering', () => {
    test('render_WhenOpen_DisplaysDialog', () => {})
    test('render_WhenClosed_DoesNotRenderDialog', () => {})
  })

  describe('Validation', () => {
    test('submit_WithEmptyName_DisplaysValidationError', () => {})
    test('submit_WithInvalidEmail_DisplaysEmailError', () => {})
  })

  describe('Save Handler', () => {
    test('submit_WithValidData_CallsOnSave', () => {})
    test('submit_OnError_DisplaysErrorMessage', () => {})
  })
})
```

### Nesting Guidelines
- **Maximum 2-3 levels** of nesting
- Each level should have a clear purpose
- Don't over-organize - simple tests don't need describe blocks

---

## Setup and Teardown

### beforeEach (Most Common)

Use `beforeEach` to reset state before each test:

```typescript
describe('EntityService', () => {
  beforeEach(() => {
    resetAllFactories()        // Reset factory counters
    localStorage.clear()       // Clear storage
    vi.clearAllMocks()         // Clear mock call history
  })

  test('createEntity_WithValidData_PersistsToStorage', () => {
    // Test has clean state
    const entity = createDMOStub()  // Gets fresh ID: entity-1
  })

  test('getEntity_WithExistingId_ReturnsEntity', () => {
    // Test has clean state
    const entity = createDMOStub()  // Gets fresh ID: entity-1 (reset!)
  })
})
```

### Other Hooks (Use Sparingly)

| Hook | When to Use | Example |
|------|------------|---------|
| `afterEach` | Cleanup after tests | Clear timers, unmount |
| `beforeAll` | Expensive one-time setup | Initialize test database |
| `afterAll` | One-time cleanup | Close connections |

---

## Parameterized Tests

Use `test.each()` for testing same logic with different inputs:

```typescript
test.each([
  { input: '', expected: false },
  { input: 'invalid', expected: false },
  { input: 'test@example.com', expected: true },
  { input: 'user+tag@domain.co.uk', expected: true }
])(
  'validateEmail_WithInput$input_Returns$expected',
  ({ input, expected }) => {
    // Arrange
    const validator = new EmailValidator()

    // Act
    const result = validator.isValid(input)

    // Assert
    expect(result).toBe(expected)
  }
)
```

---

## No Test Logic (Mandatory)

Tests must be linear - no conditionals or loops:

```typescript
❌ BAD - Conditional logic:
test('createEntity_WithOptionalField_WorksCorrectly', () => {
  const entity = createDMOStub()

  if (entity.description) {  // ❌ No if statements!
    expect(entity.description).toBe('Default')
  }
})

✅ GOOD - Split into separate tests:
test('createEntity_WithDescription_IncludesDescription', () => {
  const entity = createDMOStub({ description: 'Test Description' })
  expect(entity.description).toBe('Test Description')
})

test('createEntity_WithoutDescription_HasNoDescription', () => {
  const entity = createDMOStub()
  expect(entity.description).toBeUndefined()
})
```

---

## Test File Organization

### Collocation
Tests live next to the code they test:

```
src/
├── features/
│   └── entity/
│       ├── EntityCard.tsx
│       ├── EntityCard.test.tsx  ← Tests here
│       ├── EntityModal.tsx
│       └── EntityModal.test.tsx
```

### File Naming
- Component: `EntityCard.test.tsx`
- Service: `entity-service.test.ts`
- Hook: `use-entity-actions.test.ts`
- Util: `validation.test.ts`

---

## Complete Template

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDMOStub, resetAllFactories } from '@/test-utils/factories'
import { EntityCard } from './EntityCard'

describe('EntityCard', () => {
  beforeEach(() => {
    resetAllFactories()
  })

  test('EntityCard_WithEntityName_DisplaysNameInHeading', () => {
    // Arrange
    const entity = createDMOStub({ name: 'Customer' })

    // Act
    render(<EntityCard entity={entity} />)

    // Assert
    expect(
      screen.getByRole('heading', { name: /customer/i })
    ).toBeInTheDocument()
  })

  test('EntityCard_OnEditClick_CallsOnEdit', async () => {
    // Arrange
    const user = userEvent.setup()
    const mockOnEdit = vi.fn()
    const entity = createDMOStub()
    render(<EntityCard entity={entity} onEdit={mockOnEdit} />)

    // Act
    await user.click(screen.getByRole('button', { name: /edit/i }))

    // Assert
    expect(mockOnEdit).toHaveBeenCalledOnce()
    expect(mockOnEdit).toHaveBeenCalledWith(entity.id)
  })
})
```

---

## Summary: Key Rules

| Rule | Required? | Description |
|------|-----------|-------------|
| **Naming Convention** | Mandatory | `MethodName_StateUnderTest_ExpectedBehavior` |
| **AAA Pattern** | Mandatory | Clear Arrange-Act-Assert with comments |
| **Single Act** | Mandatory | ONE action per test |
| **No Test Logic** | Mandatory | No if/for/while in tests |
| **Describe Blocks** | Optional | Group related tests, limit nesting to 2-3 levels |
| **beforeEach** | Recommended | Reset factories and mocks for isolation |
| **Parameterized Tests** | Optional | Use `test.each()` for similar scenarios |
| **Collocation** | Recommended | Tests next to code they test |
