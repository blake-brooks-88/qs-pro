# Future REST API Specification

Blueprint for the future backend API. TanStack Query hooks must be structured to eventually call these endpoints.

**Note:** This API does NOT exist yet. Use LocalStorageService for now, but structure hooks to match this API design.

---

## Authentication Context

All endpoints (except `/public/*`) are prefixed with `/api` and require authentication via Bearer token.

**Authentication Flow (Future):**
```
POST /auth/login → Returns access token
Include token in headers: Authorization: Bearer {token}
```

---

## API Endpoints

### 1. Authentication (`/auth`)

User identity and session management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create new user account and default organization |
| `POST` | `/auth/login` | Authenticate user, return access and refresh tokens |
| `POST` | `/auth/refresh` | Exchange refresh token for new access token |
| `POST` | `/auth/logout` | Invalidate user's refresh token |

---

### 2. Users (`/users`)

Authenticated user profile management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/me` | Get current user profile (name, email, organizations) |
| `PATCH` | `/users/me` | Update current user profile (name, avatar) |

---

### 3. Organizations (`/organizations`)

Workspace management (personal and shared).

#### Organization Management

| Method | Endpoint | Description & Permission |
|--------|----------|--------------------------|
| `GET` | `/organizations` | List user's organizations |
| `POST` | `/organizations` | Create organization (creator becomes Owner) |
| `GET` | `/organizations/{orgId}` | Get organization details (Org Member) |
| `PATCH` | `/organizations/{orgId}` | Update organization name (Org Admin) |
| `DELETE` | `/organizations/{orgId}` | Delete organization (Org Owner) |

#### Organization Members

| Method | Endpoint | Description & Permission |
|--------|----------|--------------------------|
| `GET` | `/organizations/{orgId}/members` | List members and roles (Org Member) |
| `POST` | `/organizations/{orgId}/invites` | Invite member via email (Org Admin) |
| `PATCH` | `/organizations/{orgId}/members/{userId}` | Update member role (Org Admin) |
| `DELETE` | `/organizations/{orgId}/members/{userId}` | Remove member (Org Admin) |

#### Organization Settings (Enterprise)

| Method | Endpoint | Description & Permission |
|--------|----------|--------------------------|
| `GET` | `/organizations/{orgId}/settings/sso` | Get SSO configuration (Org Owner) |
| `PUT` | `/organizations/{orgId}/settings/sso` | Configure OIDC SSO (Org Owner) |
| `GET` | `/organizations/{orgId}/audit-log` | Get audit trail (Org Owner) |

---

### 4. Projects

Collaborative project documents.

#### Project Management

| Method | Endpoint | Description & Permission |
|--------|----------|--------------------------|
| `GET` | `/projects` | List all user's projects (across orgs) |
| `GET` | `/organizations/{orgId}/projects` | List org's projects (Org Member) |
| `POST` | `/organizations/{orgId}/projects` | Create project in org (Org Admin) |
| `GET` | `/projects/{projectId}` | Get project details (Project Collaborator) |
| `PUT` | `/projects/{projectId}` | Full save of `document_state` (Project Editor) |
| `PATCH` | `/projects/{projectId}` | Update project metadata (Project Editor) |
| `DELETE` | `/projects/{projectId}` | Delete project (Org Admin or Owner) |

#### Project Collaborators

| Method | Endpoint | Description & Permission |
|--------|----------|--------------------------|
| `GET` | `/projects/{projectId}/collaborators` | List collaborators and roles (Project Collaborator) |
| `POST` | `/projects/{projectId}/collaborators` | Add collaborator (editor/viewer) (Project Editor) |
| `PATCH` | `/projects/{projectId}/collaborators/{userId}` | Update collaborator role (Project Editor) |
| `DELETE` | `/projects/{projectId}/collaborators/{userId}` | Remove collaborator (Project Editor) |

#### Project Versioning

| Method | Endpoint | Description & Permission |
|--------|----------|--------------------------|
| `GET` | `/projects/{projectId}/versions` | List historical versions (Project Collaborator) |
| `POST` | `/projects/{projectId}/versions` | Create named version snapshot (Project Editor) |
| `POST` | `/projects/{projectId}/versions/{versionId}/restore` | Restore to historical version (Project Editor) |

---

### 5. Public Access (Unauthenticated)

Read-only project sharing without authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/public/projects/{shareId}` | Get publicly-shared project (no auth required) |

---

## Permission Levels

### Organization Roles

- **Owner** - Full control including deletion
- **Admin** - Manage members, create projects
- **Member** - View organization, access projects

### Project Roles

- **Editor** - Edit project, manage collaborators
- **Viewer** - Read-only access

---

## Future Migration Pattern

### Current Implementation (LocalStorageService)

```typescript
export function useGetProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => new LocalStorageService().getProjects(),
  });
}
```

### Future Implementation (Real API)

```typescript
export function useGetProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await apiClient.get('/api/projects');
      return response.data;
    },
  });
}
```

**What Changes:** Only the `queryFn` implementation. Query keys, invalidation, and component code stay the same.

---

## Real-Time Collaboration (Phase 2)

**Future State:** Project editing will use Socket.IO, not polling:

```typescript
// Current: Simple PUT for saves
PUT /api/projects/{projectId}

// Future: Socket.IO events
socket.emit('project:edit', { projectId, changes });
socket.on('project:updated', (data) => { /* handle */ });
```

**Your Task:** Keep data fetching simple. Don't build complex polling or refetching logic.

---

## Summary

### Key Endpoints to Structure For

1. **Projects** - `GET /api/projects`, `POST /api/organizations/{orgId}/projects`
2. **Project CRUD** - `GET/PUT/PATCH/DELETE /api/projects/{projectId}`
3. **Authentication** - `POST /auth/login`, `POST /auth/logout`
4. **User Profile** - `GET /users/me`

### Current vs Future

| Current | Future |
|---------|--------|
| LocalStorageService | REST API at `/api/*` |
| No authentication | Bearer token auth |
| Instant saves | HTTP request/response |
| Local-only data | Server-persisted data |

### Migration Checklist

- [ ] Query keys match API structure (`['projects']`, `['projects', id]`)
- [ ] Query functions are swappable (single point of change)
- [ ] Data models match `zod` schemas
- [ ] Error handling is generic
- [ ] No localStorage-specific logic in components
