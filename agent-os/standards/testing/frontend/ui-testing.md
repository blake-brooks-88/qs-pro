# Frontend UI Testing Standards

Test user interfaces through accessibility-first, semantic queries that reflect how users interact with your application.

---

## Core Principles

### Accessibility-First Testing

Tests MUST use semantic, user-facing queries that prioritize accessibility:
- Query by role, label, and text (what users see/experience)
- Avoid test IDs and implementation details (CSS classes, component structure)
- Test what users can do, not how the code works

**Why:** Tests that use accessibility features ensure your UI works for all users, including those with disabilities.

---

## Query Selector Hierarchy

**Priority Order (Strict):**

1. **Preferred:** Queries accessible to everyone
2. **Acceptable:** Semantic queries
3. **Last Resort:** Test IDs (only when no alternative)

### 1. Preferred Queries (Use These First)

#### `getByRole` - Most Preferred

Query elements by their ARIA role. This is the most accessible and robust query method.

```typescript
// ✅ Button
screen.getByRole('button', { name: /submit/i });

// ✅ Heading
screen.getByRole('heading', { name: /customer/i });

// ✅ Heading with specific level
screen.getByRole('heading', { level: 1, name: /dashboard/i });

// ✅ Dialog
screen.getByRole('dialog');

// ✅ Textbox with accessible name
screen.getByRole('textbox', { name: /email/i });

// ✅ Checkbox
screen.getByRole('checkbox', { name: /i agree/i });

// ✅ List and items
screen.getByRole('list');
screen.getAllByRole('listitem');

// ✅ Combobox (select)
screen.getByRole('combobox', { name: /country/i });
```

**Common ARIA Roles:**
- `button`, `link`, `heading`, `textbox`, `checkbox`, `radio`
- `list`, `listitem`, `table`, `row`, `cell`
- `dialog`, `alert`, `navigation`, `main`, `article`
- `combobox`, `option`, `menu`, `menuitem`

#### `getByLabelText` - For Form Fields

Query form controls by their associated label text.

```typescript
// ✅ Input with associated <label>
screen.getByLabelText(/email address/i);

// ✅ Select with label
screen.getByLabelText(/country/i);

// ✅ Textarea with label
screen.getByLabelText(/description/i);
```

**Requires proper HTML:**
```html
<label for="email">Email Address</label>
<input id="email" type="text" />
<!-- OR -->
<label>
  Email Address
  <input type="text" />
</label>
```

#### `getByText` - For Non-Interactive Content

Query elements by their text content.

```typescript
// ✅ Text content
screen.getByText(/welcome to the app/i);

// ✅ Error messages
screen.getByText(/validation failed/i);

// ✅ Partial text match with regex
screen.getByText(/customer/i);

// ✅ Exact text match
screen.getByText('Customer DMO');
```

### 2. Acceptable Queries (When Preferred Unavailable)

#### `getByPlaceholderText` - For Inputs Without Labels

```typescript
// ⚠️ Acceptable, but prefer getByLabelText
screen.getByPlaceholderText(/search entities/i);
```

**Note:** Placeholders alone are not accessible. Always prefer proper labels.

#### `getByDisplayValue` - For Form Inputs with Values

```typescript
// ⚠️ Acceptable for populated inputs
screen.getByDisplayValue(/current value/i);
```

### 3. Last Resort (Avoid If Possible)

#### `getByTestId` - Only When No Semantic Alternative

```typescript
// ❌ Avoid - Not user-facing
screen.getByTestId('entity-card-wrapper');

// ✅ Better - Use role or text
screen.getByRole('article');
screen.getByText(/customer/i);
```

**When `getByTestId` is acceptable:**
- Complex custom components without semantic roles
- Third-party components you can't modify
- Canvas elements (like React Flow nodes)
- Dynamic content where text/role changes frequently

**How to add test IDs:**
```tsx
<div data-testid="custom-component">Content</div>
```

---

## Query Patterns

### Pattern 1: Buttons

```typescript
// ✅ Best - Accessible name from text content
screen.getByRole('button', { name: /submit/i });

// ✅ Best - Accessible name from aria-label
screen.getByRole('button', { name: /close dialog/i });

// ❌ Bad - Test ID
screen.getByTestId('submit-button');
```

### Pattern 2: Form Fields

```typescript
// ✅ Best - Label association
screen.getByLabelText(/email address/i);

// ✅ Best - Role with name
screen.getByRole('textbox', { name: /email address/i });

// ⚠️ Acceptable - Placeholder (not ideal for a11y)
screen.getByPlaceholderText(/enter email/i);

// ❌ Bad - Test ID
screen.getByTestId('email-input');
```

### Pattern 3: Lists and Items

```typescript
// ✅ Best - Role queries
screen.getByRole('list');
screen.getAllByRole('listitem');

// ✅ Best - Using within() for scoped queries
const list = screen.getByRole('list');
const items = within(list).getAllByRole('listitem');

// ❌ Bad - CSS selectors
container.querySelector('ul');
container.querySelectorAll('li');
```

### Pattern 4: Headings

```typescript
// ✅ Best - Role with level
screen.getByRole('heading', { level: 1, name: /dashboard/i });

// ✅ Good - Role with name (any level)
screen.getByRole('heading', { name: /customer details/i });

// ❌ Bad - CSS selector
container.querySelector('h1');
```

### Pattern 5: Dialogs and Modals

```typescript
// ✅ Best - Role
screen.getByRole('dialog');

// ✅ Best - Role with accessible name
screen.getByRole('dialog', { name: /confirm deletion/i });

// ✅ Best - Check dialog visibility
expect(screen.getByRole('dialog')).toHaveAttribute('aria-hidden', 'false');

// ❌ Bad - CSS class
container.querySelector('.modal');
```

---

## Scoped Queries with `within()`

Use `within()` to query within a specific container.

```typescript
// ✅ Find list, then query items within it
const list = screen.getByRole('list');
const items = within(list).getAllByRole('listitem');
expect(items).toHaveLength(3);

// ✅ Find dialog, then query button within it
const dialog = screen.getByRole('dialog');
const closeButton = within(dialog).getByRole('button', { name: /close/i });
await user.click(closeButton);

// ✅ Find specific card, then query elements within it
const card = screen.getByRole('article', { name: /customer/i });
expect(within(card).getByText(/active/i)).toBeInTheDocument();
```

---

## Assertions for UI Elements

### Existence Assertions

```typescript
// Element exists in document
expect(screen.getByText(/welcome/i)).toBeInTheDocument();

// Element is visible (considers CSS visibility)
expect(screen.getByRole('button')).toBeVisible();

// Element does NOT exist (use queryBy* for negative checks)
expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
```

### State Assertions

```typescript
// Button disabled state
expect(screen.getByRole('button', { name: /submit/i })).toBeDisabled();
expect(screen.getByRole('button', { name: /submit/i })).toBeEnabled();

// Checkbox/radio checked state
expect(screen.getByRole('checkbox')).toBeChecked();
expect(screen.getByRole('checkbox')).not.toBeChecked();

// Input value
expect(screen.getByRole('textbox')).toHaveValue('Customer');

// Select value
expect(screen.getByRole('combobox')).toHaveValue('dmo');
```

### Attribute Assertions

```typescript
// ARIA attributes
expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'dialog-title');
expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');

// Data attributes
expect(screen.getByRole('button')).toHaveAttribute('data-loading', 'true');

// Class assertions (avoid if possible, prefer semantic queries)
expect(screen.getByRole('button')).toHaveClass('btn-primary');
```

### Content Assertions

```typescript
// Exact text
expect(screen.getByText('Customer DMO')).toBeInTheDocument();

// Partial text match (regex, case-insensitive)
expect(screen.getByText(/customer/i)).toBeInTheDocument();

// Text content within element
const heading = screen.getByRole('heading');
expect(heading).toHaveTextContent('Customer DMO');

// Multiple text matches
expect(screen.getAllByText(/entity/i)).toHaveLength(3);
```

---

## Common Patterns

### Testing Form Submission

```typescript
test('EntityForm_OnSubmit_CallsSaveHandler', async () => {
  // Arrange
  const user = userEvent.setup();
  const mockOnSave = vi.fn();
  render(<EntityForm onSave={mockOnSave} />);

  // Act - Fill form using labels
  await user.type(screen.getByLabelText(/name/i), 'Customer');
  await user.selectOptions(screen.getByLabelText(/type/i), 'dmo');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  // Assert
  expect(mockOnSave).toHaveBeenCalledOnce();
});
```

### Testing Conditional Rendering

```typescript
test('EntityCard_WithoutBusinessPurpose_DoesNotRenderPurposeSection', () => {
  // Arrange
  const entity = createDMOStub({ businessPurpose: undefined });

  // Act
  render(<EntityCard entity={entity} />);

  // Assert - Use queryBy* for negative checks
  expect(screen.queryByText(/business purpose/i)).not.toBeInTheDocument();
});
```

### Testing Error States

```typescript
test('EntityForm_WithMissingRequiredFields_ShowsValidationErrors', async () => {
  // Arrange
  const user = userEvent.setup();
  render(<EntityForm />);

  // Act - Submit without filling required fields
  await user.click(screen.getByRole('button', { name: /submit/i }));

  // Assert - Error messages appear
  expect(screen.getByText(/name is required/i)).toBeInTheDocument();
  expect(screen.getByText(/type is required/i)).toBeInTheDocument();
});
```

### Testing Async Content

```typescript
test('EntityList_AfterAsyncLoad_DisplaysEntities', async () => {
  // Arrange
  render(<EntityList />);

  // Act - Wait for async load
  // Use findBy* for async queries (built-in waitFor)
  const firstEntity = await screen.findByText(/customer/i);

  // Assert
  expect(firstEntity).toBeInTheDocument();
});
```

---

## Anti-Patterns

### ❌ Anti-Pattern 1: Using TestId When Semantic Query Available

```typescript
// ❌ Bad - Using TestId unnecessarily
screen.getByTestId('submit-button');

// ✅ Good - Using semantic role
screen.getByRole('button', { name: /submit/i });
```

### ❌ Anti-Pattern 2: Testing Implementation Details

```typescript
// ❌ Bad - Testing internal state
expect(component.state.counter).toBe(5);

// ✅ Good - Testing observable behavior
expect(screen.getByText('Count: 5')).toBeInTheDocument();
```

### ❌ Anti-Pattern 3: Using CSS Selectors

```typescript
// ❌ Bad - CSS class or selector
container.querySelector('.entity-card__wrapper');
container.querySelector('button.submit');

// ✅ Good - Semantic role or text
screen.getByRole('article');
screen.getByRole('button', { name: /submit/i });
```

### ❌ Anti-Pattern 4: Over-Specific Assertions

```typescript
// ❌ Bad - Testing exact HTML structure
expect(container.innerHTML).toContain('<div class="entity-card">');

// ✅ Good - Testing semantic structure
expect(screen.getByRole('article')).toBeInTheDocument();
```

---

## Query Method Reference

### When to Use Each Query Variant

| Query Type | Returns | Throws if not found? | Use for |
|------------|---------|----------------------|---------|
| `getBy*` | Element | Yes | Elements that should exist |
| `queryBy*` | Element \| null | No | Negative assertions (not in document) |
| `findBy*` | Promise&lt;Element&gt; | Yes (async) | Elements that appear after async operation |
| `getAllBy*` | Element[] | Yes | Multiple elements that should exist |
| `queryAllBy*` | Element[] | No | Multiple elements (may be empty) |
| `findAllBy*` | Promise&lt;Element[]&gt; | Yes (async) | Multiple async elements |

### Quick Selection Guide

```typescript
// Element SHOULD exist (throws if not)
screen.getByRole('button');

// Element SHOULD NOT exist (null check)
expect(screen.queryByText(/error/i)).not.toBeInTheDocument();

// Element appears AFTER async operation
const result = await screen.findByText(/loaded/i);

// Multiple elements
const buttons = screen.getAllByRole('button');
expect(buttons).toHaveLength(3);
```

---

## Summary

### Key Principles

1. **Accessibility First:** Use semantic queries that work for all users
2. **Query Hierarchy:** `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
3. **User-Facing:** Test what users see and do, not implementation details
4. **Scoped Queries:** Use `within()` to query within specific containers
5. **Proper Assertions:** Use appropriate query variants (`get`, `query`, `find`)

### Quick Reference

```typescript
// Preferred queries
screen.getByRole('button', { name: /submit/i });
screen.getByLabelText(/email/i);
screen.getByText(/welcome/i);

// Scoped queries
const list = screen.getByRole('list');
within(list).getAllByRole('listitem');

// Negative checks
expect(screen.queryByText(/error/i)).not.toBeInTheDocument();

// Async queries
await screen.findByText(/loaded/i);

// State checks
expect(screen.getByRole('button')).toBeDisabled();
expect(screen.getByRole('checkbox')).toBeChecked();
```
