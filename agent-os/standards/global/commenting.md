# Code Commenting Standards

## Philosophy

**Self-documenting code is the primary goal.** Write clear, descriptive names for variables, functions, and components. Comments are an exception, not the rule.

---

## When to Use Comments

### 1. JSDoc for Public APIs (Mandatory)

All shared components, hooks, and utility functions must have JSDoc blocks:

```typescript
/**
 * Fetches user data from the repository and caches the result
 * @param userId - Unique identifier for the user
 * @param options - Optional configuration for the fetch operation
 * @returns User object with profile data
 * @throws {UserNotFoundError} If user does not exist
 */
export function getUserData(
  userId: string,
  options?: FetchOptions
): Promise<User> {
  // Implementation
}
```

**JSDoc Requirements:**
- Purpose description (one sentence)
- `@param` for each parameter with description
- `@returns` for return value
- `@throws` for potential errors

### 2. Critical "Why" Comments (Rare)

Use sparingly for non-obvious logic, workarounds, or external context:

```typescript
✅ // Workaround for API bug TICKET-123: API returns null instead of empty array
if (response.data === null) {
  return []
}

✅ // Performance: Debounce prevents 100+ API calls during rapid user input
const debouncedSearch = debounce(searchUsers, 300)

✅ // NOTE: Order matters - validation must run before transformation
validateData(input)
transformData(input)
```

**Valid Reasons:**
- External bug workarounds (with ticket reference)
- Performance optimizations that aren't obvious
- Order dependencies
- Business rule constraints

---

## Forbidden Patterns

### ❌ Commented-Out Code

Never leave commented-out code in the repository. Use version control instead.

```typescript
❌ BAD:
// function oldImplementation() {
//   return legacyLogic()
// }

function newImplementation() {
  return modernLogic()
}
```

**Solution:** Delete it. Git history preserves old code.

### ❌ Redundant Comments

Don't describe what the code obviously does:

```typescript
❌ BAD:
// Set user name to John
const userName = 'John'

// Loop through all users
users.forEach(user => {
  // Process the user
  processUser(user)
})

✅ GOOD:
const userName = 'John'

users.forEach(user => {
  processUser(user)
})
```

### ❌ TODO Comments Without Context

If you must use TODO, include context and ownership:

```typescript
❌ BAD:
// TODO: Fix this

✅ ACCEPTABLE:
// TODO(blake): Refactor to use new API endpoint (TICKET-456) - target: Sprint 23
```

**Better:** Create a ticket and delete the TODO.

---

## Self-Documenting Code Patterns

### Clear Naming
```typescript
✅ const isEligibleForDiscount = age > 65 || isMember
❌ const x = age > 65 || isMember  // What is x?
```

### Extract Complex Conditions
```typescript
✅ const canAccessAdminPanel = user.role === 'admin' && user.isActive
if (canAccessAdminPanel) { ... }

❌ if (user.role === 'admin' && user.isActive) { ... }  // What does this mean?
```

### Descriptive Function Names
```typescript
✅ function calculateTotalCostWithTax(items: Item[], taxRate: number) { ... }
❌ function calc(items: Item[], rate: number) { ... }  // Needs comment to explain
```

### Type Annotations
```typescript
✅ function processUser(user: User): ProcessedUserData { ... }
❌ function processUser(user: any): any { ... }  // What goes in/out?
```

---

## Summary

| Type | Required? | Example |
|------|-----------|---------|
| JSDoc for public APIs | Yes | `@param`, `@returns` |
| Critical "why" comments | Rare | Bug workarounds, performance notes |
| Commented-out code | Never | Use git history |
| Redundant comments | Never | "Set x to 5" for `x = 5` |
| Self-documenting names | Always | `isEligibleForDiscount` vs `x` |
