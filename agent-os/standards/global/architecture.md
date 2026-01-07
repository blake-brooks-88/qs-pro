# Architecture Standards

## Feature-Based Organization

### Structure
```
client/src/features/[feature-name]/
├── components/          # UI components
├── hooks/               # Custom hooks
├── types/               # TypeScript definitions
├── utils/               # Helper functions
└── index.ts             # Barrel export
```

### Rules
- **Co-location:** All code for a feature must reside in a single directory under `client/src/features/`
- **Barrel Exports:** Every feature folder must include an `index.ts` that re-exports all public components, hooks, types, and utilities
- **New Files:** When adding files to a feature, export them through the barrel to maintain centralized imports

**Example:**
```typescript
// client/src/features/pipeline/index.ts
export { PipelineCanvas } from './components/PipelineCanvas'
export { usePipelineActions } from './hooks/usePipelineActions'
export type { Pipeline, PipelineNode } from './types'
export { validatePipeline } from './utils/validation'
```

---

## Data Management

### Repository Pattern
Encapsulate all data fetching and persistence logic in dedicated services or custom hooks:

- **Purpose:** Centralize server interactions and data access
- **Examples:** `useProjectActions`, `LocalStorageService`, `usePipelineRepository`
- **Benefit:** Single source of truth for data operations, easier to mock and test

**Example:**
```typescript
// client/src/features/project/hooks/useProjectActions.ts
export function useProjectActions() {
  const queryClient = useQueryClient()

  const createProject = useMutation({
    mutationFn: (data: CreateProjectInput) =>
      LocalStorageService.createProject(data),
    onSuccess: () => queryClient.invalidateQueries(['projects'])
  })

  return { createProject }
}
```

### Data Normalization
Store entities by ID in lookup objects to prevent duplication:

**Anti-pattern:**
```typescript
// ❌ Array with duplicates possible
const pipelines: Pipeline[] = [...]
```

**Correct Pattern:**
```typescript
// ✅ Normalized by ID
const pipelines: Record<string, Pipeline> = {
  'pipeline-1': { id: 'pipeline-1', name: 'ETL Pipeline', ... },
  'pipeline-2': { id: 'pipeline-2', name: 'Analytics', ... }
}
```

**Benefits:**
- O(1) lookups by ID
- Prevents duplicate entries
- Simplifies updates (direct access by key)
- Easier to sync with server state

---

## Path Aliases

Use TypeScript path aliases for cleaner imports:

```typescript
// ✅ With aliases
import { PipelineCanvas } from '@/features/pipeline'
import { Button } from '@/components/ui'

// ❌ Without aliases
import { PipelineCanvas } from '../../../features/pipeline'
import { Button } from '../../../components/ui'
```

**Configuration:** See `tsconfig.json` and `vite.config.ts` for alias setup.
