# Linting and Type Safety Standards

## TypeScript Strict Mode

### Configuration
This project uses TypeScript strict mode: `"strict": true`

### Rules

#### ❌ Never Use `any`
```typescript
❌ PROHIBITED:
function processData(data: any) { ... }
const result: any = fetchData()

✅ REQUIRED:
function processData(data: UserData) { ... }
const result: FetchResult = fetchData()

✅ IF TYPE IS TRULY UNKNOWN:
function processData(data: unknown) {
  if (isUserData(data)) {
    // Now TypeScript knows the type
    console.log(data.name)
  }
}
```

**Why:**
- `any` disables type checking
- Defeats the purpose of TypeScript
- Allows bugs to slip through

#### Explicit Prop Types
All React components must declare explicit prop interfaces:

```typescript
❌ PROHIBITED:
export function UserProfile(props: any) { ... }
export function UserProfile(props) { ... }

✅ REQUIRED:
interface UserProfileProps {
  userId: string
  onUpdate?: (user: User) => void
}

export function UserProfile({ userId, onUpdate }: UserProfileProps) {
  // Implementation
}
```

---

## ESLint Compliance

### Required Actions
1. **Fix errors immediately** - Do not commit code with linting errors
2. **Follow all rules** defined in `.eslintrc.cjs`
3. **Run linter** before committing: `npm run lint`

### Common Rules

#### No Unused Variables
```typescript
❌ ESLint Error:
const unusedVar = 'value'  // 'unusedVar' is assigned but never used

✅ Fix:
// Remove the unused variable
```

#### Consistent Return Types
```typescript
❌ ESLint Error:
function getValue(flag: boolean) {
  if (flag) {
    return 'value'
  }
  // Missing return for else case
}

✅ Fix:
function getValue(flag: boolean): string {
  if (flag) {
    return 'value'
  }
  return 'default'
}
```

#### React Hooks Rules
```typescript
❌ ESLint Error:
function Component() {
  if (condition) {
    useEffect(() => { ... })  // Hooks must not be called conditionally
  }
}

✅ Fix:
function Component() {
  useEffect(() => {
    if (condition) {
      // Logic inside effect
    }
  }, [condition])
}
```

---

## Prettier Formatting

### Automatic Formatting
All code must be formatted with Prettier:

```bash
npm run format       # Format all files
npm run format:check # Check if files are formatted
```

### Configuration
Prettier rules are defined in `.prettierrc` or `package.json`

**Key Rules:**
- Semi-colons: Enforced
- Single quotes: Enforced
- Trailing commas: ES5 style
- Tab width: 2 spaces
- Print width: 100 characters

### Pre-commit Hook
The `build-checker.mjs` hook runs on commit and will:
1. Check TypeScript types (`tsc --noEmit`)
2. Run ESLint
3. Check Prettier formatting
4. Block commit if any errors exist

---

## Build Verification

### Before Every Commit
```bash
npm run build        # Ensure build succeeds
npm run type-check   # Verify TypeScript types
npm run lint         # Check ESLint rules
npm test             # Run test suite
```

### CI/CD Requirements
All checks must pass:
- ✅ TypeScript compilation (no errors)
- ✅ ESLint (no errors, warnings allowed)
- ✅ Prettier (all files formatted)
- ✅ Tests (all passing)
- ✅ Build (successful production build)

---

## Common Type Safety Patterns

### Optional Chaining
```typescript
✅ const userName = user?.profile?.name ?? 'Guest'
❌ const userName = user && user.profile && user.profile.name || 'Guest'
```

### Type Guards
```typescript
✅ function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj
}

if (isUser(data)) {
  console.log(data.id)  // TypeScript knows it's a User
}
```

### Non-null Assertion (Use Sparingly)
```typescript
✅ ACCEPTABLE (when you're certain):
const element = document.getElementById('root')!

⚠️ PREFER (safer):
const element = document.getElementById('root')
if (!element) throw new Error('Root element not found')
```

---

## Summary

| Standard | Required | Tool |
|----------|----------|------|
| No `any` types | Yes | TypeScript |
| Explicit prop interfaces | Yes | TypeScript |
| Fix linting errors immediately | Yes | ESLint |
| Format all code | Yes | Prettier |
| Pass build checks | Yes | `build-checker.mjs` |
| Run tests before commit | Yes | Vitest |

**Bottom Line:** Code that doesn't pass type checks, linting, and formatting cannot be committed.
