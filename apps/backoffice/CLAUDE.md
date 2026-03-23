# apps/backoffice

React 18 + Vite admin portal for SaaS operations (tenant management, billing, invoicing).

## Commands

```bash
pnpm backoffice:dev                # API + web concurrently
pnpm backoffice:web:dev            # Web only on :5174
pnpm --filter @qpp/backoffice test # Tests
```

## Key Patterns

**Auth:** Better Auth client with mandatory 2FA. `ProtectedRoute` enforces role hierarchy (`viewer=0 < editor=1 < admin=2`) and redirects to `/2fa-setup` if MFA is not enabled.

**State Management:** Same three-tier pattern as main web app:
- Server state: TanStack Query (`staleTime: 5min`, `retry: 1`)
- Global UI: Zustand (sidebar toggle only)
- Session: Custom `useSession()` hook wrapping better-auth client

**UI:** Radix + Tailwind + CVA (same as main web app). Uses `@solar-icons/react` for icons.

**Data Tables:** `@tanstack/react-table` with manual sorting/pagination wiring — parent component maps column IDs to API field names.

## Gotchas

- **Port 5174** (not 5173 like main web). Proxies `/api/*` to `http://127.0.0.1:3002` (backoffice-api, not main API on 3000).
- **2FA is mandatory:** All users, including viewers, must complete 2FA setup before accessing any route.
- **401 redirects via `window.location.href`:** Axios interceptor does a full-page redirect to `/login` — no in-app handling possible.
- **better-auth 2FA redirect:** Hard-coded `window.location.href = "/2fa"` — circumvents React Router, may cause state loss.
- **No shared API types:** Response DTOs are defined locally in frontend hooks, not imported from backoffice-api. Risk of drift.
- **Role hierarchy defined twice:** In both `ProtectedRoute.tsx` and `DashboardLayout.tsx` — keep them in sync.
