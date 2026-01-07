# Mock-First Development Philosophy

Build frontend features in a mock-first environment that's ready to connect to a real backend.

---

## Core Principles

### Current Development Phase

**You are building in a "mock-first" environment:**

1. **No Authentication Required** - App must be fully usable by anyone who opens it
2. **LocalStorageService as Mock Database** - All data fetching and persistence uses LocalStorageService
3. **Future-Proof Structure** - Code is structured to easily switch to real API later

### Critical Rules

**DO:**
- Use `LocalStorageService` for all data operations
- Structure TanStack Query hooks to mimic future API intent
- Adhere strictly to `zod` schemas in `shared/schema.ts`
- Design components to work without authentication

**DO NOT:**
- Implement login, registration, or authentication-gated routes
- Build authentication flows or user sessions
- Assume backend exists yet

---

## Future-Proofing Pattern

### TanStack Query Hook Structure

Structure query hooks to easily swap implementations later:

```typescript
// ✅ Good - Easy to swap implementation
export function useGetProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      // Currently: LocalStorageService
      const service = new LocalStorageService();
      return service.getProjects();

      // Future: Just change this line to API call
      // return apiClient.get('/api/projects');
    },
  });
}

// ✅ Good - Mutation follows same pattern
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertProject) => {
      // Currently: LocalStorageService
      const service = new LocalStorageService();
      return service.createProject(data);

      // Future: Just change to API call
      // return apiClient.post('/api/projects', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
```

### Why This Works

**Benefits:**
- Single point of change when switching to real API
- Query keys already match future API structure
- Optimistic updates and cache invalidation already in place
- Type safety from shared schemas ensures API compatibility

**Migration Path:**
```typescript
// Step 1: Current (LocalStorageService)
const service = new LocalStorageService();
return service.getProjects();

// Step 2: Future (Real API)
return apiClient.get('/api/projects');
```

---

## Data Schema Compliance

### Strict Schema Adherence

All data MUST adhere to `zod` schemas in `shared/schema.ts`:

```typescript
import { projectSchema, insertProjectSchema } from '@/shared/schema';

// ✅ Good - Validate with schema
const project = projectSchema.parse(data);

// ✅ Good - Type-safe from schema
type Project = z.infer<typeof projectSchema>;
type InsertProject = z.infer<typeof insertProjectSchema>;

// ❌ Bad - Manual types that don't match schema
interface Project {
  id: string;
  name: string;
  // Missing fields from schema
}
```

**Why:** Schemas are the contract between frontend and future backend.

---

## Component Design

### No Authentication Assumptions

Components must work without user sessions:

```typescript
// ✅ Good - No auth required
export function ProjectList() {
  const { data: projects } = useGetProjects();

  return (
    <div>
      {projects?.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

// ❌ Bad - Assumes authenticated user
export function ProjectList() {
  const { user } = useAuth(); // Don't build this yet!
  const { data: projects } = useGetProjects(user.id);
  // ...
}
```

### Future-Friendly Permissions

Design components to easily add permission checks later:

```typescript
// ✅ Good - Easy to add permission check later
export function DeleteProjectButton({ projectId }: Props) {
  const deleteMutation = useDeleteProject();

  // Current: Always enabled
  // Future: Add permission check here
  // const canDelete = useProjectPermissions(projectId).canDelete;

  return (
    <Button
      onClick={() => deleteMutation.mutate(projectId)}
      // disabled={!canDelete} // Future: Uncomment this
    >
      Delete
    </Button>
  );
}
```

---

## LocalStorageService Usage

### Standard Pattern

```typescript
import { LocalStorageService } from '@/lib/storage/LocalStorageService';

// Create instance
const service = new LocalStorageService();

// Read operations
const projects = service.getProjects();
const project = service.getProject(projectId);

// Write operations
const newProject = service.createProject(projectData);
const updated = service.updateProject(projectId, updates);

// Delete operations
service.deleteProject(projectId);
```

### Testing with LocalStorageService

Mock the service in tests:

```typescript
import { vi } from 'vitest';

vi.mock('@/lib/storage/LocalStorageService', () => ({
  LocalStorageService: vi.fn().mockImplementation(() => ({
    getProjects: vi.fn().mockReturnValue([createProjectStub()]),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    deleteProject: vi.fn(),
  })),
}));
```

---

## Future Architecture Context

**What's Coming (Do NOT Implement Yet):**

1. **Real REST API** - Full backend with authentication
2. **Real-time Collaboration** - Socket.IO for live editing
3. **RBAC** - Organization and project-level permissions
4. **Teams** - Multi-user organizations

**Your Task:** Build features that won't conflict with these future additions.

**Reference Documents:**
- Future API specification: See `backend-intent/api-spec.md`
- Real-time and RBAC context: Future architecture plans

---

## Migration Readiness Checklist

When switching from LocalStorageService to real API, verify:

- [ ] All query hooks use consistent query keys (e.g., `['projects']`)
- [ ] All mutations invalidate appropriate queries
- [ ] All data uses `zod` schemas from `shared/schema.ts`
- [ ] No authentication logic needs to be removed
- [ ] Component props don't assume localStorage structure
- [ ] Error handling is generic (not localStorage-specific)

---

## Summary

### Key Principles

1. **Mock-First** - Use LocalStorageService, no auth required
2. **Future-Proof** - Structure code for easy API swap
3. **Schema-Driven** - All data adheres to `zod` schemas
4. **Permission-Ready** - Design components to easily add RBAC later

### Quick Reference

```typescript
// Query pattern
export function useGetProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => new LocalStorageService().getProjects(),
  });
}

// Mutation pattern
export function useCreateProject() {
  return useMutation({
    mutationFn: (data) => new LocalStorageService().createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

// Component pattern (no auth)
export function MyFeature() {
  const { data } = useGetProjects();
  // Build features without authentication
}
```
