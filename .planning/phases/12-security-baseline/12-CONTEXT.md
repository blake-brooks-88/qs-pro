# Phase 12: Security Baseline - Context

**Gathered:** 2026-02-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Session lifecycle compliance and embedded app security for an MCE iframe-hosted application. Harden session timeout enforcement, session rotation, logout endpoint, security headers, stub cleanup, and audit logging for session events. Full OWASP ZAP scanning and AppExchange review is Phase 16.

</domain>

<decisions>
## Implementation Decisions

### Session Timeout Policy
- **Idle timeout: 30 minutes** with sliding window (resets on each API request)
- **Absolute timeout: 8 hours** (max session lifespan regardless of activity)
- **Server-side enforcement** via timestamps in the encrypted session cookie (`lastActivityAt`, `createdAt`)
- SessionGuard validates both timestamps on every request; returns 401 when either threshold exceeded
- MCE also enforces its own session timeout independently — Q++ timeout is an additional layer

### Session Expiry UX
- **Toast + auto-reconnect pattern**: When Q++ session expires (30-min idle or 8-hr absolute), frontend catches the 401 and silently attempts MCE OAuth re-auth
- If MCE session is still active: seamless reconnect, brief toast "Session refreshed"
- If MCE session also expired: modal overlay "Session expired — please refresh" (needs full MCE re-auth from parent frame)
- Editor state preserved throughout (client-side Zustand/Monaco state survives re-auth)

### Session Persistence Model
- **Keep cookie-based sessions** (`@fastify/secure-session`) — sessions already survive server restarts since data is in the encrypted cookie
- Add `createdAt` and `lastActivityAt` timestamps to the session cookie for server-side timeout validation
- No Redis session store needed for Phase 12 — defer to Phase 14+ when admin force-logout or horizontal scaling is needed
- Migration path to Redis sessions is straightforward (~1-2 days) when ready

### Session Rotation
- Regenerate session on re-authentication only (post-idle-timeout MCE re-auth)
- OWASP mandatory minimum satisfied — regenerate on any privilege change
- Periodic rotation deferred — less impactful for cookie-encrypted sessions (no persistent server-side session ID to hijack)

### Logout Behavior
- **MCE manages logout** — users don't log out of Q++ directly; they log out of MCE or close the tab
- MCE calls `GET /api/auth/logout` when user logs out or switches Business Units
- **Harden existing endpoint**: ensure reliable session cookie clearing, proper HTTP status, handle edge cases (already-expired, no session)
- Add audit logging (`auth.logout` event — already partially implemented)
- No explicit logout button needed in Q++ UI

### Audit Events
- **Log `auth.session_expired`** when SessionGuard detects expired session via timestamps — completes the deferred TODO from Phase 9
- Inject AuditService into SessionGuard (or use a lightweight logging approach from `@qpp/backend-shared`)

### Stub Endpoint Cleanup
- **Remove `GET /` (root)** — returns "hello", serves no purpose
- **Remove `GET /api/users/me`** — dummy stub conflicting with real `/api/auth/me`
- **Full debug code scan**: audit for TODO comments, console.log statements, hardcoded test values, development-only routes, and debug middleware that should be removed or gated

### Security Audit Findings (Current Posture)
- SQL Injection: PASS (Drizzle ORM parameterized queries)
- SOAP Injection: PASS (escapeXml() on all SOAP builders)
- XSS: PASS (no dangerouslySetInnerHTML, React safe defaults)
- Hardcoded Secrets: PASS (all via env vars + Zod validation)
- Sensitive Logging: PASS (Sentry/Pino redaction configured)
- Input Validation: PASS (Zod across all endpoints)
- Open Redirects: PASS (all redirects hardcoded to /)
- Error Leakage: PASS (GlobalExceptionFilter sanitizes 5xx)
- CSRF: PASS (timingSafeEqual, cryptographic tokens)
- RLS: PASS (PostgreSQL policies on all tenant-scoped tables)
- Dependencies: needs `pnpm audit` run and remediation

### Claude's Discretion
- Exact implementation of sliding window timestamp update mechanism
- How to inject audit logging into SessionGuard (DI approach)
- Whether to add `X-Frame-Options` legacy header alongside CSP frame-ancestors
- `pnpm audit` remediation approach (patch vs upgrade vs ignore)
- Debug code scan methodology and thresholds

</decisions>

<specifics>
## Specific Ideas

- "Users may go away and do other stuff in MCE so stay logged in, but like 2 hours in they may want to come back and pick back up" — toast + auto-reconnect is the least obtrusive, secure path
- MCE already handles session expiration that admins configure — Q++ timeout is an additional defensive layer, not the primary one
- "The only AppExchange app I've seen has its sessions tied to MCE auth, so you don't log out of the appexchange app" — confirmed by MCE docs: MCE calls the logout endpoint when user logs out of MCE or switches BUs
- Migration from cookie-based to Redis sessions should be straightforward when needed (~1-2 days)
- Vibecoded apps commonly fail on XSS (86%), log injection (88%), and input validation — our codebase passes all three (Veracode 2025 GenAI Code Security Report)

</specifics>

<deferred>
## Deferred Ideas

- **Redis-backed session store** — Defer to Phase 14+ when admin force-logout or horizontal scaling is needed. Cookie-based sessions sufficient for now.
- **Periodic session rotation** — Defer until Redis sessions are implemented. Less impactful for cookie-encrypted model.
- **Full OWASP ZAP dynamic scan** — Phase 16 (AppExchange Security Review)
- **Static analysis deep dive** — Phase 16
- **Penetration testing report** — Phase 16
- **AppExchange submission package** — Phase 16
- **Broader security audit against full AppExchange checklist** — User expressed interest in comprehensive audit; captured for Phase 16 scope

</deferred>

---

*Phase: 12-security-baseline*
*Context gathered: 2026-02-16*
