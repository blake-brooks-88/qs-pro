# Component Design Principles

## Single Responsibility Principle (SRP)

### Definition
Each component must be small and focused on **one task**.

### When to Split
A component that does multiple things must be broken down:

**❌ Anti-pattern (too many responsibilities):**
```typescript
function UserDashboard() {
  // Responsibility 1: Data fetching
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])

  useEffect(() => {
    fetchUser().then(setUser)
    fetchProjects().then(setProjects)
  }, [])

  // Responsibility 2: State management
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({})

  // Responsibility 3: Business logic
  const handleSave = () => { /* complex logic */ }
  const validateForm = () => { /* validation */ }

  // Responsibility 4: UI rendering
  return <div>{/* 200+ lines of JSX */}</div>
}
```

**✅ Better (split responsibilities):**
```typescript
// 1. Data fetching hook
function useUserDashboard(userId: string) {
  const { data: user } = useQuery(['user', userId], () => fetchUser(userId))
  const { data: projects } = useQuery(['projects'], fetchProjects)
  return { user, projects }
}

// 2. Presentational component (UI only)
function UserDashboard({ userId }: UserDashboardProps) {
  const { user, projects } = useUserDashboard(userId)

  if (!user) return <LoadingSkeleton />

  return (
    <div>
      <UserHeader user={user} />
      <ProjectList projects={projects} />
    </div>
  )
}

// 3. Sub-components (focused UI pieces)
function UserHeader({ user }: UserHeaderProps) { /* ... */ }
function ProjectList({ projects }: ProjectListProps) { /* ... */ }
```

---

## Separation of Concerns

### Pattern: Logic in Hooks, UI in Components

**✅ Custom Hook (handles logic):**
```typescript
export function useEntityActions(entityId: string) {
  const queryClient = useQueryClient()

  const updateEntity = useMutation({
    mutationFn: (data: UpdateEntityInput) =>
      LocalStorageService.updateEntity(entityId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['entities'])
    }
  })

  const deleteEntity = useMutation({
    mutationFn: () => LocalStorageService.deleteEntity(entityId)
  })

  return { updateEntity, deleteEntity }
}
```

**✅ Presentational Component (renders UI):**
```typescript
function EntityCard({ entity }: EntityCardProps) {
  const { updateEntity, deleteEntity } = useEntityActions(entity.id)

  return (
    <Card>
      <CardHeader>{entity.name}</CardHeader>
      <CardActions>
        <Button onClick={() => updateEntity.mutate({ name: 'New Name' })}>
          Update
        </Button>
        <Button onClick={() => deleteEntity.mutate()}>
          Delete
        </Button>
      </CardActions>
    </Card>
  )
}
```

**Benefits:**
- Hook can be tested independently
- Component focuses on rendering
- Logic can be reused across components
- Easier to understand and maintain

---

## Composition Over Configuration

### Principle
Favor composition using `children` prop over complex configuration props.

**❌ Configuration (too many props):**
```typescript
interface CardProps {
  showTitle?: boolean
  showFooter?: boolean
  isEditable?: boolean
  hasBorder?: boolean
  hasActions?: boolean
}

function Card({
  showTitle,
  showFooter,
  isEditable,
  hasBorder,
  hasActions
}: CardProps) {
  return (
    <div className={hasBorder ? 'border' : ''}>
      {showTitle && <CardTitle />}
      {/* Complex conditional rendering */}
      {showFooter && <CardFooter />}
      {hasActions && isEditable && <CardActions />}
    </div>
  )
}
```

**✅ Composition (flexible):**
```typescript
interface CardProps {
  children: React.ReactNode
  className?: string
}

function Card({ children, className }: CardProps) {
  return <div className={className}>{children}</div>
}

// Sub-components for composition
Card.Header = function CardHeader({ children }: CardSubProps) {
  return <div className="card-header">{children}</div>
}

Card.Body = function CardBody({ children }: CardSubProps) {
  return <div className="card-body">{children}</div>
}

Card.Footer = function CardFooter({ children }: CardSubProps) {
  return <div className="card-footer">{children}</div>
}

// Usage - compose exactly what you need
function UserCard() {
  return (
    <Card className="border">
      <Card.Header>
        <h2>User Profile</h2>
      </Card.Header>
      <Card.Body>
        <UserDetails />
      </Card.Body>
      <Card.Footer>
        <ActionButtons />
      </Card.Footer>
    </Card>
  )
}
```

**Benefits:**
- More flexible
- Easier to understand usage
- No prop explosion
- Simpler component logic

---

## Accessibility (A11y)

### Mandatory Requirements

#### Use Semantic HTML
```typescript
✅ REQUIRED:
<button onClick={handleClick}>Submit</button>
<nav>...</nav>
<main>...</main>
<header>...</header>

❌ PROHIBITED:
<div onClick={handleClick}>Submit</div>  // Not keyboard accessible
<div>...</div>  // Not semantic
```

#### Provide ARIA Attributes
```typescript
✅ REQUIRED:
<button
  aria-label="Delete user profile"
  aria-disabled={isDisabled}
  onClick={handleDelete}
>
  <TrashIcon />
</button>

<input
  type="text"
  aria-label="Search users"
  aria-describedby="search-help"
/>
<span id="search-help">Enter at least 3 characters</span>
```

#### Keyboard Navigation
```typescript
✅ Ensure all interactive elements are keyboard accessible:
<div
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick()
    }
  }}
  onClick={handleClick}
>
  Custom Button
</div>
```

#### Focus Management
```typescript
✅ Manage focus for modals and dynamic content:
function Modal({ isOpen, onClose }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isOpen && modalRef.current) {
      modalRef.current.focus()
    }
  }, [isOpen])

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      {/* Modal content */}
    </div>
  )
}
```

---

## Summary

| Principle | Do | Don't |
|-----------|----|----|
| **SRP** | One component, one task | Component with multiple responsibilities |
| **Separation** | Logic in hooks, UI in components | Mix data fetching and rendering |
| **Composition** | Use `children` prop | Many boolean config props |
| **A11y** | Semantic HTML + ARIA | `<div onClick>` without keyboard support |
