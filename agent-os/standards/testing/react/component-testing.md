# React Component Testing

Test React components using React Testing Library (RTL) with accessibility-first queries and user-centric interactions.

---

## Core APIs

### `render()` - Mount Component for Testing

```typescript
import { render, screen } from '@testing-library/react';

// Basic render
render(<MyButton onClick={mockFn} />);

// With props
const entity = createEntityStub();
render(<EntityCard entity={entity} />);

// Returns container and utils
const { container, rerender } = render(<MyComponent />);
```

### `screen` - Query Rendered Elements

```typescript
import { screen } from '@testing-library/react';

// Preferred: semantic queries
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email/i);
screen.getByText(/welcome/i);

// Query variants
screen.getBy*     // Element should exist (throws if not)
screen.queryBy*   // Element may not exist (returns null)
screen.findBy*    // Element appears async (returns Promise)
```

### `within()` - Scoped Queries

```typescript
import { screen, within } from '@testing-library/react';

// Query within specific container
const list = screen.getByRole('list');
const items = within(list).getAllByRole('listitem');

// Query within dialog
const dialog = screen.getByRole('dialog');
const closeButton = within(dialog).getByRole('button', { name: /close/i });
```

### `userEvent` - Simulate User Interactions

```typescript
import userEvent from '@testing-library/user-event';

// Always setup userEvent
const user = userEvent.setup();

// Click interactions
await user.click(screen.getByRole('button'));

// Type interactions
await user.type(screen.getByLabelText(/email/i), 'test@example.com');

// Clear and type
await user.clear(screen.getByRole('textbox'));
await user.type(screen.getByRole('textbox'), 'New text');

// Select options
await user.selectOptions(screen.getByLabelText(/country/i), 'US');

// Keyboard interactions
await user.keyboard('{Enter}');
await user.keyboard('{Escape}');
```

---

## Component Testing Patterns

### Pattern 1: Basic Component Rendering

```typescript
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createEntityStub } from '@/test-utils/factories';
import { EntityCard } from './EntityCard';

describe('EntityCard', () => {
  test('EntityCard_WithEntityName_DisplaysNameInHeading', () => {
    // Arrange
    const entity = createEntityStub({ name: 'Customer' });

    // Act
    render(<EntityCard entity={entity} />);

    // Assert
    expect(screen.getByRole('heading', { name: /customer/i })).toBeInTheDocument();
  });
});
```

### Pattern 2: Testing User Interactions

```typescript
test('SaveButton_OnClick_CallsSaveHandler', async () => {
  // Arrange
  const user = userEvent.setup();
  const mockSave = vi.fn();
  const entity = createEntityStub();
  render(<SaveButton entity={entity} onSave={mockSave} />);

  // Act
  await user.click(screen.getByRole('button', { name: /save/i }));

  // Assert
  expect(mockSave).toHaveBeenCalledOnce();
  expect(mockSave).toHaveBeenCalledWith(entity);
});
```

### Pattern 3: Testing Form Inputs

```typescript
test('EntityForm_OnInput_UpdatesFormState', async () => {
  // Arrange
  const user = userEvent.setup();
  const mockOnChange = vi.fn();
  render(<EntityForm onChange={mockOnChange} />);

  // Act
  await user.type(screen.getByLabelText(/name/i), 'Customer');
  await user.selectOptions(screen.getByLabelText(/type/i), 'dmo');

  // Assert
  expect(mockOnChange).toHaveBeenCalled();
  const formData = mockOnChange.mock.calls[0]?.[0];
  expect(formData).toBeDefined();
  expect(formData?.name).toBe('Customer');
  expect(formData?.type).toBe('dmo');
});
```

### Pattern 4: Testing Conditional Rendering

```typescript
test('EntityCard_WithBusinessPurpose_DisplaysPurpose', () => {
  // Arrange
  const entity = createEntityStub({ businessPurpose: 'Track customer data' });

  // Act
  render(<EntityCard entity={entity} />);

  // Assert
  expect(screen.getByText(/track customer data/i)).toBeInTheDocument();
});

test('EntityCard_WithoutBusinessPurpose_DoesNotRenderPurposeSection', () => {
  // Arrange
  const entity = createEntityStub({ businessPurpose: undefined });

  // Act
  render(<EntityCard entity={entity} />);

  // Assert - Use queryBy* for negative checks
  expect(screen.queryByText(/business purpose/i)).not.toBeInTheDocument();
});
```

### Pattern 5: Testing Disabled States

```typescript
test('SubmitButton_WhenProcessing_IsDisabled', () => {
  // Arrange
  render(<SubmitButton isProcessing={true} />);

  // Assert
  expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
});

test('SubmitButton_WhenDisabled_DoesNotTriggerHandler', async () => {
  // Arrange
  const user = userEvent.setup();
  const mockOnClick = vi.fn();
  render(<SubmitButton onClick={mockOnClick} disabled={true} />);

  // Act
  await user.click(screen.getByRole('button', { name: /submit/i }));

  // Assert
  expect(mockOnClick).not.toHaveBeenCalled();
});
```

### Pattern 6: Testing Async Operations

```typescript
test('EntityList_AfterAsyncLoad_DisplaysEntities', async () => {
  // Arrange
  render(<EntityList />);

  // Act - Use findBy* for async queries (built-in waitFor)
  const firstEntity = await screen.findByText(/customer/i);

  // Assert
  expect(firstEntity).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

test('SaveButton_OnSuccess_ShowsSuccessMessage', async () => {
  // Arrange
  const user = userEvent.setup();
  render(<SaveButton entity={createEntityStub()} />);

  // Act
  await user.click(screen.getByRole('button', { name: /save/i }));

  // Assert - Wait for async success message
  expect(await screen.findByText(/saved successfully/i)).toBeInTheDocument();
});
```

---

## Testing with Props

### Testing Prop Callbacks

```typescript
test('DeleteButton_OnClick_CallsOnDeleteWithEntityId', async () => {
  // Arrange
  const user = userEvent.setup();
  const mockOnDelete = vi.fn();
  const entity = createEntityStub({ id: 'entity-123' });
  render(<DeleteButton entity={entity} onDelete={mockOnDelete} />);

  // Act
  await user.click(screen.getByRole('button', { name: /delete/i }));

  // Assert
  expect(mockOnDelete).toHaveBeenCalledOnce();
  expect(mockOnDelete).toHaveBeenCalledWith('entity-123');
});
```

### Testing Prop-Based Rendering

```typescript
test('StatusBadge_WithActiveStatus_ShowsGreenBadge', () => {
  // Arrange
  render(<StatusBadge status="active" />);

  // Assert
  const badge = screen.getByText(/active/i);
  expect(badge).toBeInTheDocument();
  expect(badge).toHaveClass('badge-success'); // If absolutely necessary
});

test('StatusBadge_WithInactiveStatus_ShowsRedBadge', () => {
  // Arrange
  render(<StatusBadge status="inactive" />);

  // Assert
  expect(screen.getByText(/inactive/i)).toBeInTheDocument();
});
```

---

## Testing with Zustand Store

### Pattern: Mock Store Data

```typescript
import { useEntityStore } from '@/store/entityStore';

describe('EntityList', () => {
  test('EntityList_WithStoreEntities_DisplaysEntityCards', () => {
    // Arrange
    const entities = [
      createEntityStub({ id: 'entity-1', name: 'Customer' }),
      createEntityStub({ id: 'entity-2', name: 'Order' }),
    ];

    // Mock store state
    useEntityStore.setState({ entities });

    // Act
    render(<EntityList />);

    // Assert
    expect(screen.getByText(/customer/i)).toBeInTheDocument();
    expect(screen.getByText(/order/i)).toBeInTheDocument();
  });
});
```

### Pattern: Test Store Mutations

```typescript
test('AddEntityButton_OnClick_AddsEntityToStore', async () => {
  // Arrange
  const user = userEvent.setup();
  const initialEntities = [createEntityStub()];
  useEntityStore.setState({ entities: initialEntities });
  render(<AddEntityButton />);

  // Act
  await user.click(screen.getByRole('button', { name: /add entity/i }));

  // Assert
  const entities = useEntityStore.getState().entities;
  expect(entities).toHaveLength(2);
});
```

---

## Testing Lists and Collections

### Pattern: Test List Rendering

```typescript
test('EntityList_WithMultipleEntities_RendersAllItems', () => {
  // Arrange
  const entities = [
    createEntityStub({ id: 'entity-1', name: 'Customer' }),
    createEntityStub({ id: 'entity-2', name: 'Order' }),
    createEntityStub({ id: 'entity-3', name: 'Product' }),
  ];

  // Act
  render(<EntityList entities={entities} />);

  // Assert
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(3);
});
```

### Pattern: Test Empty State

```typescript
test('EntityList_WithEmptyArray_ShowsEmptyMessage', () => {
  // Arrange
  const entities: Entity[] = [];

  // Act
  render(<EntityList entities={entities} />);

  // Assert
  expect(screen.getByText(/no entities found/i)).toBeInTheDocument();
});
```

### Pattern: Query Within List Items

```typescript
test('EntityList_WithEntities_EachItemHasEditButton', () => {
  // Arrange
  const entities = [
    createEntityStub({ id: 'entity-1' }),
    createEntityStub({ id: 'entity-2' }),
  ];
  render(<EntityList entities={entities} />);

  // Act
  const items = screen.getAllByRole('listitem');

  // Assert
  items.forEach(item => {
    expect(within(item).getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });
});
```

---

## Complete Component Test Example

```typescript
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEntityStub, resetAllFactories } from '@/test-utils/factories';
import { EntityCard } from './EntityCard';

describe('EntityCard', () => {
  beforeEach(() => {
    resetAllFactories(); // MANDATORY for factory-based tests
  });

  test('EntityCard_WithEntityName_DisplaysNameInHeading', () => {
    // Arrange
    const entity = createEntityStub({ name: 'Customer' });

    // Act
    render(<EntityCard entity={entity} />);

    // Assert
    expect(screen.getByRole('heading', { name: /customer/i })).toBeInTheDocument();
  });

  test('EntityCard_WithBusinessPurpose_DisplaysPurpose', () => {
    // Arrange
    const entity = createEntityStub({ businessPurpose: 'Track customers' });

    // Act
    render(<EntityCard entity={entity} />);

    // Assert
    expect(screen.getByText(/track customers/i)).toBeInTheDocument();
  });

  test('EntityCard_OnEditClick_CallsOnEditWithEntity', async () => {
    // Arrange
    const user = userEvent.setup();
    const mockOnEdit = vi.fn();
    const entity = createEntityStub({ id: 'entity-123' });
    render(<EntityCard entity={entity} onEdit={mockOnEdit} />);

    // Act
    await user.click(screen.getByRole('button', { name: /edit/i }));

    // Assert
    expect(mockOnEdit).toHaveBeenCalledOnce();
    expect(mockOnEdit).toHaveBeenCalledWith(entity);
  });

  test('EntityCard_WithoutBusinessPurpose_DoesNotRenderPurposeSection', () => {
    // Arrange
    const entity = createEntityStub({ businessPurpose: undefined });

    // Act
    render(<EntityCard entity={entity} />);

    // Assert
    expect(screen.queryByText(/business purpose/i)).not.toBeInTheDocument();
  });
});
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Not Using userEvent.setup()

```typescript
// ❌ Bad - Missing setup
test('test', async () => {
  render(<MyButton />);
  await userEvent.click(screen.getByRole('button')); // Error-prone
});

// ✅ Good - Proper setup
test('test', async () => {
  const user = userEvent.setup();
  render(<MyButton />);
  await user.click(screen.getByRole('button'));
});
```

### ❌ Anti-Pattern 2: Testing Implementation Details

```typescript
// ❌ Bad - Testing internal state
expect(component.state.isOpen).toBe(true);

// ✅ Good - Testing observable behavior
expect(screen.getByRole('dialog')).toBeVisible();
```

### ❌ Anti-Pattern 3: Using Container Queries

```typescript
// ❌ Bad - CSS selectors
const { container } = render(<MyButton />);
expect(container.querySelector('.btn-primary')).toBeInTheDocument();

// ✅ Good - Semantic queries
render(<MyButton />);
expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
```

---

## Summary

### Essential APIs

- **`render()`** - Mount component for testing
- **`screen`** - Query rendered elements
- **`within()`** - Scoped queries within container
- **`userEvent`** - Simulate user interactions (always use `.setup()`)

### Query Priority

1. `getByRole()` - Most preferred
2. `getByLabelText()` - For forms
3. `getByText()` - For content
4. `getByTestId()` - Last resort

### Key Patterns

- Use factories for test data
- Test user-facing behavior, not implementation
- Use `async/await` for all user interactions
- Use `findBy*` for async queries
- Use `queryBy*` for negative assertions

### Quick Reference

```typescript
// Setup
const user = userEvent.setup();
const entity = createEntityStub();

// Render
render(<MyComponent entity={entity} onSave={mockFn} />);

// Query
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email/i);

// Interact
await user.click(screen.getByRole('button'));
await user.type(screen.getByLabelText(/email/i), 'test@example.com');

// Assert
expect(screen.getByText(/success/i)).toBeInTheDocument();
expect(mockFn).toHaveBeenCalledOnce();
```
