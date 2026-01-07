# State Management: The 3-Tier Rule

## Decision Flow

Follow this hierarchy for **all** state management decisions:

```
1. Local State (useState)
   ↓ If state needs to be shared between non-related components
2. Zustand (Global Client State)
   ↓ If state comes from/goes to a server
3. TanStack Query (Server State)
```

---

## Tier 1: Local State (useState)

### When to Use
**Default choice** for any ephemeral, non-shared state.

### Use Cases
- Form inputs
- Modal visibility
- Toggles and switches
- UI transitions
- Component-specific flags

### Examples

```typescript
✅ Form Input:
function UserForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  return (
    <form>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
    </form>
  )
}

✅ Modal Visibility:
function Dashboard() {
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setIsModalOpen(true)}>Open Modal</Button>
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}

✅ Toggle State:
function Accordion() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div>
      <button onClick={() => setIsExpanded(!isExpanded)}>Toggle</button>
      {isExpanded && <AccordionContent />}
    </div>
  )
}
```

---

## Tier 2: Zustand (Global Client State)

### When to Use
**Only** when multiple, non-related components need to read or write the same client-side state.

### Use Cases
- Canvas state (nodes, edges, selections)
- Global UI state (sidebar open/closed, theme)
- App-wide settings
- Multi-step form state shared across routes

### Critical Rule: Use Selectors

**❌ WRONG (re-renders on any state change):**
```typescript
function NodeList() {
  const store = useEntityStore()  // Subscribes to ENTIRE store
  return <div>{store.nodes.map(node => <Node key={node.id} />)}</div>
}
```

**✅ CORRECT (only re-renders when nodes change):**
```typescript
function NodeList() {
  const nodes = useEntityStore(s => s.nodes)  // Subscribes only to nodes
  return <div>{nodes.map(node => <Node key={node.id} />)}</div>
}
```

### Example Store

```typescript
// stores/entity-store.ts
interface EntityStore {
  nodes: Node[]
  edges: Edge[]
  selectedNodeId: string | null
  addNode: (node: Node) => void
  selectNode: (id: string) => void
}

export const useEntityStore = create<EntityStore>((set) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,

  addNode: (node) =>
    set((state) => ({ nodes: [...state.nodes, node] })),

  selectNode: (id) =>
    set({ selectedNodeId: id })
}))
```

### Usage with Selectors

```typescript
// Component only cares about selected node
function NodeInspector() {
  const selectedNodeId = useEntityStore(s => s.selectedNodeId)
  const nodes = useEntityStore(s => s.nodes)

  const selectedNode = nodes.find(n => n.id === selectedNodeId)

  if (!selectedNode) return <div>No node selected</div>
  return <div>{selectedNode.name}</div>
}

// Component only cares about edges
function EdgeList() {
  const edges = useEntityStore(s => s.edges)
  return <div>{edges.map(edge => <Edge key={edge.id} />)}</div>
}
```

---

## Tier 3: TanStack Query (Server State)

### When to Use
**Always** for data that comes from or goes to a server (or will in the future).

### Use Cases
- CRUD operations (Create, Read, Update, Delete)
- Data fetching and caching
- Optimistic updates
- Background refetching

### Rules
1. **Must** use existing custom hooks: `useProjects`, `useProjectActions`, `useEntityActions`
2. **Must not** call `LocalStorageService` directly from components
3. Custom hooks are the correct abstraction layer

### Example: Query (Read)

```typescript
// hooks/use-projects.ts
export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => LocalStorageService.getProjects()
  })
}

// Component usage
function ProjectList() {
  const { data: projects, isLoading, error } = useProjects()

  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorMessage error={error} />

  return (
    <div>
      {projects?.map(project => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}
```

### Example: Mutation (Create/Update/Delete)

```typescript
// hooks/use-project-actions.ts
export function useProjectActions() {
  const queryClient = useQueryClient()

  const createProject = useMutation({
    mutationFn: (data: CreateProjectInput) =>
      LocalStorageService.createProject(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['projects'])
    }
  })

  const updateProject = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectInput }) =>
      LocalStorageService.updateProject(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['projects'])
    }
  })

  return { createProject, updateProject }
}

// Component usage
function CreateProjectForm() {
  const { createProject } = useProjectActions()
  const [name, setName] = useState('')  // Local state for form

  const handleSubmit = () => {
    createProject.mutate({ name })
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={createProject.isPending}>
        {createProject.isPending ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  )
}
```

---

## Decision Tree

```
Is the state shared between components?
├─ NO → Use useState (Tier 1)
└─ YES → Does the state come from/go to a server?
    ├─ YES → Use TanStack Query (Tier 3)
    └─ NO → Is it client-only state needed by multiple non-related components?
        ├─ YES → Use Zustand (Tier 2)
        └─ NO → Use useState (Tier 1)
```

---

## Common Patterns

### Pattern 1: Form with Server Mutation
```typescript
function EditUserForm({ userId }: EditUserFormProps) {
  // Server state (Tier 3)
  const { data: user } = useUser(userId)
  const { updateUser } = useUserActions()

  // Local form state (Tier 1)
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')

  const handleSubmit = () => {
    updateUser.mutate({ userId, data: { name, email } })
  }

  return <form onSubmit={handleSubmit}>...</form>
}
```

### Pattern 2: Canvas with Global UI State
```typescript
function Canvas() {
  // Global client state (Tier 2) - shared across components
  const nodes = useEntityStore(s => s.nodes)
  const addNode = useEntityStore(s => s.addNode)

  // Local interaction state (Tier 1) - canvas-specific
  const [isDragging, setIsDragging] = useState(false)

  return <div>...</div>
}
```

### Pattern 3: List with Server Data
```typescript
function ProjectList() {
  // Server state (Tier 3)
  const { data: projects } = useProjects()

  // Local UI state (Tier 1)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredProjects = projects?.filter(p =>
    p.name.includes(searchQuery)
  )

  return <div>...</div>
}
```

---

## Anti-Patterns

### ❌ Calling Service Directly
```typescript
❌ WRONG:
function Component() {
  const [data, setData] = useState([])

  useEffect(() => {
    LocalStorageService.getProjects().then(setData)
  }, [])

  return <div>...</div>
}

✅ CORRECT:
function Component() {
  const { data } = useProjects()  // Use custom hook
  return <div>...</div>
}
```

### ❌ Zustand for Server Data
```typescript
❌ WRONG:
const useStore = create((set) => ({
  projects: [],
  fetchProjects: async () => {
    const data = await LocalStorageService.getProjects()
    set({ projects: data })
  }
}))

✅ CORRECT:
// Use TanStack Query for server data
const { data: projects } = useProjects()
```

### ❌ Subscribing to Entire Store
```typescript
❌ WRONG:
const store = useEntityStore()
const nodes = store.nodes  // Re-renders on ANY store change

✅ CORRECT:
const nodes = useEntityStore(s => s.nodes)  // Only re-renders when nodes change
```

---

## Summary

| Tier | Tool | When to Use | Example |
|------|------|-------------|---------|
| 1 | `useState` | Local, non-shared state | Form inputs, modal visibility |
| 2 | Zustand | Global client state | Canvas state, UI settings |
| 3 | TanStack Query | Server data (CRUD) | Projects, users, entities |

**Golden Rule:** Start with Tier 1, move up only when necessary.
