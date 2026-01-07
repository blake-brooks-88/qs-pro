# Naming Conventions

## Quick Reference

| Type | Convention | Example |
|------|-----------|---------|
| Files | `kebab-case` | `user-profile.tsx` |
| Folders | `kebab-case` | `pipeline-editor/` |
| Components | `PascalCase` | `UserProfile` |
| Types/Interfaces | `PascalCase` | `UserProfileProps` |
| Variables | `camelCase` | `userData` |
| Functions | `camelCase` | `getUserData` |
| Hooks | `camelCase` with `use` prefix | `useUserData` |
| Constants | `UPPERCASE_SNAKE_CASE` | `API_URL`, `MAX_RETRIES` |

## Examples by Context

### Files and Folders
```
✅ user-profile.tsx
✅ pipeline-editor/
✅ data-transformation-utils.ts

❌ UserProfile.tsx
❌ pipelineEditor/
❌ dataTransformationUtils.ts
```

### React Components
```typescript
✅ function UserProfile({ userId }: UserProfileProps) { ... }
✅ export const PipelineCanvas: React.FC<PipelineCanvasProps> = ({ ... }) => { ... }

❌ function userProfile({ userId }: userProfileProps) { ... }
❌ export const pipeline_canvas: React.FC<pipeline_canvas_props> = ({ ... }) => { ... }
```

### Functions and Variables
```typescript
✅ const userData = fetchUserData()
✅ function calculateTotalCost(items: Item[]) { ... }
✅ const isValidEmail = (email: string) => /^[^@]+@[^@]+$/.test(email)

❌ const UserData = fetchUserData()
❌ function CalculateTotalCost(items: Item[]) { ... }
❌ const is_valid_email = (email: string) => /^[^@]+@[^@]+$/.test(email)
```

### Custom Hooks
```typescript
✅ function useUserData(userId: string) { ... }
✅ function usePipelineActions() { ... }

❌ function getUserData(userId: string) { ... }  // Not a hook
❌ function UsePipelineActions() { ... }        // Wrong case
```

### Constants
```typescript
✅ const API_URL = 'https://api.example.com'
✅ const MAX_RETRY_ATTEMPTS = 3
✅ const DEFAULT_TIMEOUT_MS = 5000

❌ const apiUrl = 'https://api.example.com'     // Use UPPERCASE_SNAKE_CASE for constants
❌ const maxRetryAttempts = 3
```

### TypeScript Types and Interfaces
```typescript
✅ interface UserProfileProps { ... }
✅ type PipelineNode = { ... }
✅ type ValidationResult<T> = { ... }

❌ interface userProfileProps { ... }
❌ type pipelineNode = { ... }
```

## Special Cases

### Event Handlers
Prefix with `handle` or `on`:
```typescript
✅ function handleSubmit(event: FormEvent) { ... }
✅ const onUserSelect = (userId: string) => { ... }
```

### Boolean Variables
Prefix with `is`, `has`, `should`, or `can`:
```typescript
✅ const isLoading = true
✅ const hasPermission = checkPermission()
✅ const shouldRender = isVisible && !isLoading
```

### Private/Internal Members
Prefix with underscore (use sparingly):
```typescript
✅ const _internalHelper = () => { ... }  // Private function
✅ const _cacheKey = 'user-data'          // Internal constant
```
