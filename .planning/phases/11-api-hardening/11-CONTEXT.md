# Phase 11: API Hardening - Context

**Gathered:** 2026-02-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the API layer with centralized validation, error path auditing, comprehensive RLS regression tests, outbound request safety controls, and global rate limiting. The codebase already has strong hardening (Zod safeParse on all mutations, RFC 9457 errors, RLS on all 10 tenant-scoped tables, SOAP XML escaping, MCE timeouts/retry). This phase formalizes and fills the remaining gaps.

</domain>

<decisions>
## Implementation Decisions

### Validation Strategy
- Refactor from per-controller Zod safeParse to centralized ZodValidationPipe (~20 lines)
- Apply via `@UsePipes(new ZodValidationPipe(Schema))` or `@Body(new ZodValidationPipe(Schema))` on each endpoint
- Validation errors formatted as RFC 9457 Problem Details with `violations` array (not raw Zod format)
- Add UUID format validation on all path parameters (`:id`, `:savedQueryId`, etc.) — returns 400 instead of letting invalid UUIDs hit PostgreSQL as 500
- Estimated refactoring effort: ~2-3 hours across 13 endpoints

### Error Response Contract
- Audit ALL error paths to verify every endpoint returns RFC 9457 format
- Ensure no NestJS exceptions leak through un-transformed (e.g., built-in 404, Fastify parsing errors)
- Wire ZodValidationPipe to produce RFC 9457 responses via GlobalExceptionFilter
- Existing error architecture (error-codes.ts, error-messages.ts, error-policy.ts) is well-organized — no restructuring needed

### RLS Regression Tests
- Single dedicated test file: `rls-isolation.integration.test.ts`
- Cover ALL 10 RLS-protected tables from scratch
- Test exact isolation scope per table (not just tenant isolation):
  - tenant+mid+user: shell_query_runs, folders
  - tenant+mid: saved_queries, query_versions, query_publish_events, credentials, audit_logs
  - tenant-only: snippets, tenant_feature_overrides
  - tenant+mid (legacy): query_history (already dropped — skip)
- Each table gets: read isolation test (tenant A insert, tenant B query → 0 rows) + write protection test (WITH CHECK violation)
- System tables (tenants, users): assert RLS is NOT enabled with comment documenting why
- FORCE RLS verified on all protected tables

### Outbound Request Policy
- Host allowlist for outbound HTTP calls, enforced in MceHttpClient
- Allowlisted domains: `*.marketingcloudapis.com` (covers all MCE stacks — REST, SOAP, OAuth)
- Sentry and Loki hosts allowlisted from their respective env vars when configured
- Configurable enforcement via env var: `OUTBOUND_HOST_POLICY=log` (dev/staging) or `OUTBOUND_HOST_POLICY=block` (production)
- TSSD already validated with `^[a-z0-9-]+$` regex — no user input reaches URL construction
- MCE-provided instance URLs from OAuth are ignored (codebase reconstructs from TSSD)

### Response Size Limits
- Add `maxContentLength` to axios MCE requests with generous upper bound (padding for large MCE responses)
- Prevents memory exhaustion from malformed or unexpectedly large MCE responses
- Exact limit TBD during research — must accommodate largest legitimate MCE data retrieval responses

### Global Rate Limiting
- Add `@nestjs/throttler` with per-session tracking (custom `getTracker()` using session user ID)
- Per-IP is unreliable for Q++ — embedded iframe means users share IPs behind Salesforce proxy
- Redis storage for multi-instance deployment compatibility (Q++ already uses Redis)
- Unauthenticated endpoints (OAuth callback) not throttled — MCE OAuth flow is the rate limiter

### Claude's Discretion
- Exact rate limit threshold (likely 120 req/min — 2 req/sec accommodates rapid autocomplete/metadata during active editing)
- Exact maxContentLength value (research needed on typical MCE response sizes)
- Whether to use `@SkipThrottle()` on health/metrics endpoints
- ParseUUIDPipe vs custom Zod-based UUID pipe for path params

</decisions>

<specifics>
## Specific Ideas

- User wants the ZodValidationPipe refactor for long-term cleanliness despite current 100% coverage
- User wants full table-by-table RLS verification, not just spot-checking critical tables
- Host allowlist should use configurable log/block mode to safely roll out without breaking functionality
- Response size limits should have "padding on upper end" — don't make them too tight
- Error catalog not needed as separate document — the code-level trio (error-codes.ts, error-messages.ts, error-policy.ts) IS the documentation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-api-hardening*
*Context gathered: 2026-02-15*
