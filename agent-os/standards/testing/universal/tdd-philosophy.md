# Test-Driven Development Philosophy

## Core Principle

**Write tests first, implementation second.** Tests define expected behavior before code exists.

---

## The Red-Green-Refactor Cycle

### 1. Red: Write a Failing Test
Write a test for one specific behavior. It should fail because the implementation doesn't exist yet.

```typescript
test('getUserById_WithValidId_ReturnsUser', () => {
  const user = getUserById('user-1')
  expect(user.id).toBe('user-1')
  expect(user.name).toBe('John Doe')
})

// ❌ Test fails: getUserById is not defined
```

### 2. Green: Make It Pass
Write the simplest code that makes the test pass. Don't over-engineer.

```typescript
function getUserById(id: string): User {
  return {
    id: 'user-1',
    name: 'John Doe',
    email: 'john@example.com'
  }
}

// ✅ Test passes
```

### 3. Refactor: Improve the Code
Now that the test passes, refactor for quality without changing behavior.

```typescript
function getUserById(id: string): User {
  const users = getUsers ()
  const user = users.find(u => u.id === id)
  if (!user) throw new Error('User not found')
  return user
}

// ✅ Test still passes, code is better
```

### 4. Repeat
Add another test for the next behavior (e.g., error case), and cycle again.

---

## Benefits of TDD

### 1. Design Through Tests
Tests force you to think about API design before implementation:
- What inputs does this function need?
- What outputs should it return?
- What errors should it handle?

### 2. Built-in Documentation
Tests serve as living examples of how code should be used:

```typescript
// These tests document the API behavior
test('calculateTotal_WithEmptyCart_ReturnsZero', () => {
  expect(calculateTotal([])).toBe(0)
})

test('calculateTotal_WithItems_ReturnsSumOfPrices', () => {
  const items = [{ price: 10 }, { price: 20 }]
  expect(calculateTotal(items)).toBe(30)
})

test('calculateTotal_WithTax_AppliesTaxRate', () => {
  const items = [{ price: 100 }]
  expect(calculateTotal(items, { taxRate: 0.1 })).toBe(110)
})
```

### 3. Confidence to Refactor
With comprehensive tests, you can refactor without fear of breaking existing behavior.

### 4. Catch Bugs Early
Tests catch issues immediately, not after deployment.

---

## TDD Mindset

### Think in Behavior, Not Implementation

**❌ Wrong Mindset:**
"I need to loop through the array and sum the values"

**✅ Correct Mindset:**
"When given an array of items, the total should be the sum of their prices"

### Write Tests for Observable Outcomes

Focus on what the code **does**, not how it does it:

```typescript
✅ Test behavior (what):
test('addItem_WithValidItem_IncreasesCartSize', () => {
  const cart = new Cart()
  cart.addItem({ id: 'item-1', price: 10 })
  expect(cart.getItemCount()).toBe(1)
})

❌ Test implementation (how):
test('addItem_CallsArrayPush', () => {
  const cart = new Cart()
  const spy = vi.spyOn(cart['items'], 'push')  // Testing internal details
  cart.addItem({ id: 'item-1', price: 10 })
  expect(spy).toHaveBeenCalled()
})
```

### One Test, One Behavior

Each test should verify one specific behavior:

```typescript
✅ Single behavior per test:
test('login_WithValidCredentials_ReturnsUser', () => {
  const user = login('john@example.com', 'password123')
  expect(user.email).toBe('john@example.com')
})

test('login_WithInvalidPassword_ThrowsError', () => {
  expect(() => login('john@example.com', 'wrong')).toThrow('Invalid credentials')
})

❌ Multiple behaviors in one test:
test('login_BehaviorTests', () => {
  // Too many behaviors - hard to debug when it fails
  const user = login('john@example.com', 'password123')
  expect(user.email).toBe('john@example.com')

  expect(() => login('john@example.com', 'wrong')).toThrow()
  expect(() => login('invalid', 'password123')).toThrow()
})
```

---

## Common TDD Anti-Patterns

### 1. Writing Tests After Implementation
This defeats the purpose - tests become an afterthought, not a design tool.

### 2. Testing Implementation Details
Tests should survive refactoring. If you change how code works (but not what it does), tests shouldn't break.

### 3. Skipping the Red Phase
Always see the test fail first. This proves:
- The test can actually catch failures
- You're testing the right thing

### 4. Over-Engineering in Green Phase
Write the simplest code that passes. Refactor later.

---

## TDD Workflow Example

**Goal:** Build a `UserService.createUser()` function.

### Step 1: Red
```typescript
test('createUser_WithValidData_SavesAndReturnsUser', () => {
  const service = new UserService()
  const user = service.createUser({ name: 'John', email: 'john@example.com' })

  expect(user.id).toBeDefined()
  expect(user.name).toBe('John')
})

// ❌ Fails: UserService doesn't exist
```

### Step 2: Green (Minimal)
```typescript
class UserService {
  createUser(data: { name: string; email: string }) {
    return {
      id: 'user-1',
      name: data.name,
      email: data.email
    }
  }
}

// ✅ Passes
```

### Step 3: Add Error Test (Red)
```typescript
test('createUser_WithExistingEmail_ThrowsError', () => {
  const service = new UserService()
  service.createUser({ name: 'John', email: 'john@example.com' })

  expect(() =>
    service.createUser({ name: 'Jane', email: 'john@example.com' })
  ).toThrow('Email already exists')
})

// ❌ Fails: No validation
```

### Step 4: Green (Add Validation)
```typescript
class UserService {
  private users: User[] = []

  createUser(data: { name: string; email: string }) {
    if (this.users.some(u => u.email === data.email)) {
      throw new Error('Email already exists')
    }

    const user = {
      id: `user-${this.users.length + 1}`,
      name: data.name,
      email: data.email
    }

    this.users.push(user)
    return user
  }
}

// ✅ All tests pass
```

### Step 5: Refactor (Extract Validation)
```typescript
class UserService {
  private users: User[] = []

  createUser(data: { name: string; email: string }) {
    this.validateEmail(data.email)

    const user = this.buildUser(data)
    this.users.push(user)
    return user
  }

  private validateEmail(email: string) {
    if (this.users.some(u => u.email === email)) {
      throw new Error('Email already exists')
    }
  }

  private buildUser(data: { name: string; email: string }): User {
    return {
      id: `user-${this.users.length + 1}`,
      name: data.name,
      email: data.email
    }
  }
}

// ✅ All tests still pass, code is cleaner
```

---

## Summary

| Phase | Action | Goal |
|-------|--------|------|
| **Red** | Write failing test | Define expected behavior |
| **Green** | Make it pass (simply) | Prove it works |
| **Refactor** | Improve code quality | Clean up without breaking |

**Key Principle:** Tests define the contract. Code fulfills it.
