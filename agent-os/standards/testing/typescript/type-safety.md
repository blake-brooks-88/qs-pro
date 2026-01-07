# TypeScript Type Safety in Tests

Maintain strict TypeScript compliance in tests with zero tolerance for type escape hatches.

---

## Core Philosophy

**Zero Tolerance Policy:** Tests MUST maintain the same strict TypeScript standards as production code.

### The Three NOs

1. **NO** `@ts-ignore` - Silences errors without fixing them
2. **NO** `@ts-expect-error` - Expects errors instead of fixing them
3. **NO** `any` types - Bypasses type checking entirely

**These are NEVER acceptable in tests.**

Type errors indicate real issues that need fixing. Escape hatches hide problems and create technical debt.

---

## Prohibited vs Required Patterns

| ❌ Prohibited | ✅ Required |
|--------------|-------------|
| `// @ts-ignore` silencing errors | Validate before non-null assertion |
| `// @ts-expect-error` expecting errors | Use optional chaining `?.` |
| `data: any` bypassing checks | Create type guards |
| Force casting without validation | Use discriminated unions |
| | Use `Partial<T>` for overrides |

---

## Required Patterns

### Pattern 1: Validate Before Non-Null Assertion

Use non-null assertion (`!`) ONLY after validating the value is defined.

```typescript
// ✅ Correct: Array access
const buttons = screen.getAllByRole('button');
expect(buttons[0]).toBeDefined(); // Validate first
await user.click(buttons[0]!); // Safe after validation

// ✅ Correct: Object property
const entity = getEntity('entity-1');
expect(entity).toBeDefined();
expect(entity!.name).toBe('Customer');

// ❌ Wrong: No validation
const element = screen.getAllByRole('button')[0];
await user.click(element); // Error: possibly undefined
```

**Pattern:** Access → Assert → Use non-null assertion

### Pattern 2: Optional Chaining

Use optional chaining (`?.`) for nested access and mock calls.

```typescript
// ✅ Correct: Mock call access
const savedEntity = mockOnSave.mock.calls[0]?.[0];
expect(savedEntity).toBeDefined();
expect(savedEntity?.name).toBe('Test');

// ✅ Correct: Nested properties
const position = entity?.position?.x;
if (position !== undefined) {
  expect(position).toBe(100);
}

// ❌ Wrong: Direct access
const savedEntity = mockOnSave.mock.calls[0][0];
expect(savedEntity.name).toBe('Test'); // Error: possibly undefined
```

**When to use:** Nested properties, mock call arguments, optional object properties

### Pattern 3: Type Guards

Create type guard functions for complex type narrowing.

```typescript
// ✅ Simple type guard
function isDMO(entity: Entity): entity is DMOEntity {
  return entity.type === 'dmo';
}

if (isDMO(entity)) {
  // TypeScript knows entity is DMOEntity here
  expect(entity.dmoSpecificField).toBeDefined();
}

// ✅ Array type guard
function isEntityArray(data: unknown): data is Entity[] {
  return Array.isArray(data) && data.every(item => 'type' in item);
}

// ✅ Complex object type guard
function isValidProject(value: unknown): value is Project {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    Array.isArray(obj.entities)
  );
}
```

### Pattern 4: Discriminated Unions

Use type narrowing with discriminated unions.

```typescript
type Entity = DMOEntity | DLOEntity | DataStreamEntity;

function processEntity(entity: Entity) {
  switch (entity.type) {
    case 'dmo':
      // TypeScript knows entity is DMOEntity
      return processDMO(entity);
    case 'dlo':
      // TypeScript knows entity is DLOEntity
      return processDLO(entity);
    case 'data-stream':
      // TypeScript knows entity is DataStreamEntity
      return processDataStream(entity);
  }
}
```

### Pattern 5: Partial Types for Overrides

Use `Partial<T>` for factory override parameters.

```typescript
export function createEntityStub(overrides?: Partial<Entity>): Entity {
  const id = overrides?.id ?? `entity-${entityIdCounter++}`;

  return {
    id,
    name: overrides?.name ?? 'Test Entity',
    type: overrides?.type ?? 'dmo',
    fields: overrides?.fields ?? [createPKField()],
    position: overrides?.position ?? { x: 0, y: 0 },
    // Optional fields with conditional spread
    ...(overrides?.dataSourceId && { dataSourceId: overrides.dataSourceId }),
  };
}
```

**Why this works:**
- `Partial<Entity>` makes all properties optional
- Nullish coalescing (`??`) provides defaults
- Full type safety maintained
- Callers get autocomplete for all properties

---

## Common Error Scenarios

### Scenario 1: Array Access

**Error:** `Object is possibly 'undefined'. ts(2532)`

```typescript
// ❌ Wrong
const element = screen.getAllByRole('button')[0];
await user.click(element); // Error

// ✅ Correct
const buttons = screen.getAllByRole('button');
expect(buttons[0]).toBeDefined();
await user.click(buttons[0]!);
```

**Why:** Array access `[0]` returns `HTMLElement | undefined`

### Scenario 2: Mock Call Arguments

**Error:** `Object is possibly 'undefined'. ts(2532)`

```typescript
// ❌ Wrong
const savedEntity = mockOnSave.mock.calls[0][0];
expect(savedEntity.name).toBe('Test'); // Error

// ✅ Correct - Optional chaining
const savedEntity = mockOnSave.mock.calls[0]?.[0];
expect(savedEntity).toBeDefined();
expect(savedEntity?.name).toBe('Test');

// ✅ Correct - Validate then assert
expect(mockOnSave.mock.calls[0]).toBeDefined();
const savedEntity = mockOnSave.mock.calls[0]![0];
expect(savedEntity).toBeDefined();
expect(savedEntity!.name).toBe('Test');
```

**Why:** `mock.calls` is `any[][]`, accessing `[0][0]` could be undefined at either level

### Scenario 3: Nullable Return Values

**Error:** `Object is possibly 'null'. ts(2531)`

```typescript
// ❌ Wrong
const entity = service.getEntity('entity-1'); // Returns Entity | null
expect(entity.name).toBe('Customer'); // Error

// ✅ Correct
const entity = service.getEntity('entity-1');
expect(entity).not.toBeNull();
expect(entity!.name).toBe('Customer');
```

### Scenario 4: Optional Properties

**Error:** `Object is possibly 'undefined'. ts(2532)`

```typescript
interface Entity {
  id: string;
  name: string;
  businessPurpose?: string; // Optional
}

// ❌ Wrong
const entity = createEntityStub();
expect(entity.businessPurpose.length).toBe(10); // Error

// ✅ Correct - Optional chaining
const entity = createEntityStub({ businessPurpose: 'Test' });
expect(entity.businessPurpose?.length).toBe(4);

// ✅ Correct - Validate then access
expect(entity.businessPurpose).toBeDefined();
expect(entity.businessPurpose!.length).toBe(4);

// ✅ Correct - Type guard
if (entity.businessPurpose !== undefined) {
  expect(entity.businessPurpose.length).toBe(4);
}
```

### Scenario 5: Type Mismatch

**Error:** `Argument of type 'string' is not assignable to parameter of type 'EntityType'. ts(2345)`

```typescript
// ❌ Wrong
const type = 'dmo';
const entity = createEntityStub({ type }); // Error: string not assignable

// ✅ Correct - Explicit type
const type: EntityType = 'dmo';
const entity = createEntityStub({ type });

// ✅ Correct - Constant assertion
const type = 'dmo' as const;
const entity = createEntityStub({ type });

// ✅ Correct - Validate first
const type = getUserInput();
if (isValidEntityType(type)) {
  const entity = createEntityStub({ type });
}
```

---

## Migration Error Resolution

### Resolution Flowchart

```
TypeScript Error
      ↓
Array/object access? → YES → Validate before access (Pattern 1)
      ↓ NO
Mock call access? → YES → Use optional chaining (Pattern 2)
      ↓ NO
Nullable return? → YES → Validate not null (Pattern 1)
      ↓ NO
Optional property? → YES → Optional chaining or validate (Pattern 2/1)
      ↓ NO
Type mismatch? → YES → Use type guard or proper typing (Pattern 3)
      ↓ NO
Complex union type? → YES → Use discriminated union (Pattern 4)
      ↓ NO
Seek help
```

### Common Migration Errors

#### "Possibly Undefined" After Factory Migration

**Before:**
```typescript
const entity = {
  id: 'entity-1',
  fields: [],
};
const firstField = entity.fields[0]; // No error (TypeScript sees empty array)
```

**After:**
```typescript
const entity = createEntityStub();
const firstField = entity.fields[0]; // Error: possibly undefined
```

**Why:** Factory returns `Field[]` (might be empty), TypeScript knows array access can be undefined

**Solution:**
```typescript
const entity = createEntityStub();
expect(entity.fields[0]).toBeDefined();
const firstField = entity.fields[0]!;
```

#### "Missing Required Fields" in DTO

**Before:**
```typescript
const projectData = {
  name: 'Test Project',
};
service.createProject(projectData); // Worked with any
```

**After:**
```typescript
const projectData: InsertProject = {
  name: 'Test Project',
}; // Error: missing entities, dataSources, relationships
```

**Why:** `InsertProject` type requires all fields, before was using `any` or untyped

**Solution:**
```typescript
function createInsertProjectStub(): InsertProject {
  return {
    name: 'Test Project',
    entities: [],
    dataSources: [],
    relationships: [],
  };
}
```

---

## Best Practices

### 1. Validate Early, Assert Often

```typescript
// ✅ Good - Validate at first access
const buttons = screen.getAllByRole('button');
expect(buttons[0]).toBeDefined();
expect(buttons[0]!.textContent).toBe('Submit');

// ❌ Bad - Multiple assertions without validation
const buttons = screen.getAllByRole('button');
expect(buttons[0]!.textContent).toBe('Submit');
expect(buttons[0]!.disabled).toBe(false);
```

### 2. Use Type Guards for Reusability

```typescript
// ✅ Good - Reusable type guard
function isDMO(entity: Entity): entity is DMOEntity {
  return entity.type === 'dmo';
}

// Use in multiple tests
const dmos = entities.filter(isDMO); // Type guard works with filter!
```

### 3. Prefer Type Safety Over Convenience

```typescript
// ❌ Bad - Convenient but unsafe
const data = JSON.parse(jsonString) as Project;

// ✅ Good - Safe but verbose
const data: unknown = JSON.parse(jsonString);
if (isValidProject(data)) {
  processProject(data);
} else {
  throw new Error('Invalid project data');
}
```

### 4. Use Strict tsconfig Settings

Ensure `tsconfig.json` has strict settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "noUnusedLocals": true,
    "noImplicitReturns": true
  }
}
```

---

## Quick Reference

| Scenario | Solution |
|----------|----------|
| Array access | `expect(arr[0]).toBeDefined(); arr[0]!` |
| Mock calls | `const arg = mock.calls[0]?.[0]; expect(arg).toBeDefined()` |
| Nullable return | `expect(value).not.toBeNull(); value!.prop` |
| Optional property | `value?.optional` or `expect(value.optional).toBeDefined()` |
| Type narrowing | Use type guard function |
| Union type | Use discriminated union switch |
| Factory overrides | Use `Partial<T>` with `??` defaults |

### When You See TypeScript Errors

1. Read the error message carefully
2. Identify the pattern (array, mock, nullable, optional)
3. Apply the appropriate fix from this guide
4. Never use escape hatches (`@ts-ignore`, `any`)
5. Validate the fix: `npx tsc --noEmit` and `npm test`
