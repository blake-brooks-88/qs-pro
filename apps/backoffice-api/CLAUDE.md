# apps/backoffice-api

NestJS 11 + Fastify 5 admin API. Manages tenants, billing (Stripe), and audit logging.

## Commands

```bash
pnpm backoffice:api:dev            # Watch mode on :3002
pnpm --filter backoffice-api test  # Unit tests
pnpm --filter backoffice-api test:integration  # Integration tests
pnpm backoffice:seed               # Seed admin user
```

## Key Differences from Main API

| Aspect | Backoffice API | Main API |
|--------|----------------|----------|
| Auth | Better Auth (separate DB) | Custom JWT + sessions |
| DB URL | `DATABASE_URL_BACKOFFICE` | `DATABASE_URL` |
| Port | 3002 | 3000 |
| Core dep | Stripe SDK | MCE SOAP API |
| Scope | SaaS ops (tenants, billing) | User-facing SQL IDE |

## Key Patterns

**Auth:** Better Auth with Drizzle adapter. Separate backoffice tables (`boUsers`, `boSessions`, etc.). Guards are `APP_GUARD` providers:
- `AuthGuard` — Sets `request.backofficeUser` and `request.backofficeSession`
- `RolesGuard` — Hierarchical role check (`viewer < editor < admin`)
- `@Public()` decorator bypasses auth (health checks)

**Audit Logging:** Every admin action (tier changes, cancellations, lookups, feature overrides) is logged. Fire-and-forget — errors are logged but never thrown.

**Throttling:** Global 30 req/60s (Redis-backed). Per-endpoint override via `@Throttle()` + `BackofficeThrottlerGuard`.

## Gotchas

- **Separate database URL:** Uses `DATABASE_URL_BACKOFFICE`, not `DATABASE_URL`. Safety assertions enforce read-only role in production.
- **No path aliases:** Uses relative imports, not `@/`.
- **String-based DI tokens:** Services injected via `@Inject("BackofficeAuditService")` — if provider names change, injection breaks silently.
- **Audit logging silently fails:** Async fire-and-forget. Missing audit logs won't block operations.
- **Integration test isolation:** Pool mode is `forks` (each test in separate process). Cleanup is explicit in `afterAll()`.
- **`editor` role exists but has no endpoints:** Defined in hierarchy for future use.
