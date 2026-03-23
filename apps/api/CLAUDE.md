# apps/api

NestJS 11 + Fastify 5 backend. Feature-based module organization under `src/`.

## Commands

```bash
pnpm api:dev                       # Watch mode (builds packages first, kills :3000)
pnpm --filter api test             # Unit tests only
pnpm --filter api test:integration # Integration tests (requires Postgres + Redis)
pnpm --filter api test:e2e         # E2E tests (full app startup)
```

## Module Structure

Each feature module follows: `{feature}.module.ts`, `{feature}.controller.ts`, `{feature}.service.ts`, with `__tests__/` for colocated unit tests.

## Key Patterns

**Auth & Access Control:**
- `@CurrentUser` parameter decorator extracts `userId`, `tenantId`, `mid` from `request.user`
- `@RequireRole(...roles)` + `RolesGuard` for role-based access
- `SessionThrottlerGuard` is a global `APP_GUARD` — throttles by session userId or IP

**Validation & Errors:**
- `ZodValidationPipe` for input validation (Zod schemas from `@qpp/shared-types`)
- `GlobalExceptionFilter` converts all exceptions to RFC 9457 Problem Details
- Integrates with Sentry via `@SentryExceptionCaptured()`

**DI Tokens:**
- Custom repositories use string tokens: `@Inject('ORG_SUBSCRIPTION_REPOSITORY')`

## Gotchas

- **RLS is fail-closed:** Fastify hook in `configure-app.ts` sets PostgreSQL session variables (`app.tenant_id`, `app.mid`, `app.user_id`) per request. If cleanup fails in production, the app **kills the connection pool and exits** to prevent cross-tenant data leaks.
- **No path aliases:** Unlike `apps/web`, the API uses relative imports (`./`), not `@/` aliases.
- **Raw body capture:** Only enabled for `/api/billing/webhook` (Stripe signature verification).
- **Security headers:** Set on every response via Fastify hook (X-Frame-Options, CSP, STS, etc.).
- **Redis DB 15:** E2E/integration tests redirect Redis to DB 15 for isolation.

## Test Conventions

| Type | Location | Pattern | Config |
|------|----------|---------|--------|
| Unit | `src/**/__tests__/` | `*.unit.test.ts` | `vitest.config.ts` |
| Integration | `test/` | `*.integration.test.ts` | `vitest-integration.config.ts` |
| E2E | `test/` | `*.e2e.test.ts` | `vitest-e2e.config.ts` |

Integration and E2E tests require running infrastructure (`docker-compose up -d`).
