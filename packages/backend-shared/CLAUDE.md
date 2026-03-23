# packages/backend-shared

Shared NestJS modules for backend services: MCE integration, database context, auth, encryption, error handling.

## Commands

```bash
pnpm --filter @qpp/backend-shared test             # Unit tests
pnpm --filter @qpp/backend-shared test:integration  # Integration tests (requires DB)
```

## What This Package Provides

- **MCE integration:** SOAP/REST services for data extensions, query definitions, metadata, relationships
- **Database context:** RLS middleware, connection pooling, per-request tenant context
- **Auth:** JWT verification, session guards, seat limiting
- **Error handling:** `AppError` with error codes, `ProblemDetails` (RFC 9457)
- **Encryption:** Encryption service module for sensitive field handling
- **HTTP utilities:** `withRetry()` for exponential backoff on transient failures

## Key Patterns

- **MCE timeouts:** Different operations have different timeout configs (see `MCE_TIMEOUTS`)
- **SOAP XML:** Requires careful escaping via `escapeXml()` utility
- **SSRF guard:** Built-in protection for outbound HTTP calls
- **RLS context:** Must be set per-request via middleware; all DB queries are filtered by `app.tenant_id` and `app.mid`

## Gotchas

- **Integration tests need running infrastructure:** Excluded from `pnpm test`; run separately with `pnpm test:integration`.
- **Consumed by both `api` and `worker`:** Changes here affect both apps. Test across both.
- **MSW for HTTP mocking:** Unit tests mock MCE SOAP/REST calls via Mock Service Worker.
