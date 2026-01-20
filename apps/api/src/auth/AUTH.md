# API Authentication (MCE)

This API authenticates users launching the app from Salesforce Marketing Cloud Engagement (MCE) and establishes a server-side session that the frontend uses for subsequent API calls.

## Summary

We support two entry points:

1. **MCE App Switcher SSO (JWT → server-to-server token exchange)** — *Legacy Packages only*
   - `POST /api/auth/login` receives an MCE-signed JWT from the MCE iframe.
   - The API verifies the JWT signature, extracts identity + stack (`tssd`), performs an OAuth token exchange, stores tokens, and sets a secure session cookie.

2. **OAuth Authorization Code flow (redirect-based)** — *Enhanced Packages (current)*
   - `GET /api/auth/login` redirects the browser to `https://{tssd}.auth.marketingcloudapis.com/v2/authorize`.
   - `GET /api/auth/callback` receives the authorization code, exchanges it for tokens, stores tokens, and sets a secure session cookie.

**Important:** Enhanced Packages (created after ~2023) do NOT post a JWT. They use the OAuth 2.0 Authorization Code flow exclusively. The `GET /api/auth/login` endpoint is loaded directly in the MCE iframe, which then redirects through the OAuth flow.

After either entry point, authenticated requests are authorized via the session cookie (not by passing access tokens from the browser).

## How Sessions Work

Sessions are handled by `@fastify/secure-session` in `apps/api/src/main.ts`.

- Cookie settings (current defaults):
  - `httpOnly: true` prevents JavaScript from reading the cookie.
  - `secure: true` requires HTTPS (required for iframe-based MCE embedding).
  - `sameSite: 'none'` allows cookies in an MCE iframe embed.
- Session contents:
  - `userId` (internal DB user id)
  - `tenantId` (internal DB tenant id)
  - `mid` (Business Unit context)
  - `csrfToken` (per-session token required on state-changing requests)
- Authorization:
  - `apps/api/src/auth/session.guard.ts` enforces presence of `userId`, `tenantId`, and `mid` and attaches `{ userId, tenantId, mid }` onto `request.user`.

## Tenant + BU Isolation (Postgres RLS)

This service is multi-tenant and Business Unit (BU) scoped. We enforce isolation with Postgres Row Level Security (RLS) and require that every request runs with a DB “tenant context” derived from the session.

- **Isolation key:** `(tenantId, mid)` (MID = BU / Member ID).
- **RLS mode:** `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` on tenant-scoped tables.
- **Policy predicate:** compares row columns to per-request settings:
  - `tenant_id::text = current_setting('app.tenant_id', true)`
  - `mid::text = current_setting('app.mid', true)` (for BU-scoped tables)

### How We Set RLS Context Per Request

RLS depends on settings stored on the *same database connection* that executes queries. Because we use a connection pool, we must ensure the context does not “bleed” across requests and that the context is consistently present for all DB operations.

Implementation (current approach):
- On each request, we read `tenantId` + `mid` from the secure-session cookie.
- We reserve a DB connection for the request, set both settings on that connection, and bind the request to use that DB handle for all queries.
- On response finish/close/error, we reset the settings and release the connection back to the pool.

Code references:
- Request-lifetime DB context + RLS setup: `apps/api/src/main.ts`
- Async request context holder: `apps/api/src/database/db-context.ts`

This is the difference between:
- “No credentials found” (RLS is active but context wasn’t applied, so the row is invisible), and
- Correct behavior (RLS context is applied, so `(tenantId, mid)` rows are visible).

## Token Storage (“Token Wallet”)

Tokens are stored server-side in the database (Credentials table).

- Refresh token: stored encrypted at rest using AES-256-GCM via `encrypt()`/`decrypt()` from `@qpp/database`.
- Access token: stored encrypted at rest using the same AES-256-GCM mechanism; decrypted only just-in-time for outbound MCE API calls.
- Encryption key:
  - `ENCRYPTION_KEY` must be a stable 32-byte hex key (as required by `@qpp/database`).

The browser never receives refresh tokens.

## Flows in Detail

### 1) MCE App Switcher JWT SSO

**Endpoint:** `POST /api/auth/login`

**Code:** `apps/api/src/auth/auth.controller.ts` → `AuthService.handleJwtLogin()`

1. MCE loads the app in an iframe and posts a signed JWT to the backend.
   - In this repo, the frontend listens for the platform’s JWT via `postMessage` and forwards it to `POST /api/auth/login`.
2. The backend verifies the JWT signature with `MCE_JWT_SIGNING_SECRET` using `jose.jwtVerify()`:
   - Algorithm restricted to `HS256`.
   - Optional strict checks if configured:
     - `MCE_JWT_ISSUER`
     - `MCE_JWT_AUDIENCE`
3. The backend extracts and validates required claims:
   - `user_id` (mapped to `sfUserId`)
   - `enterprise_id` (mapped to `eid`)
   - `member_id` (mapped to `mid`)
   - `stack` or `application_context.base_url` (mapped to `tssd`)
4. The backend performs a server-to-server OAuth token request:
   - `POST https://{tssd}.auth.marketingcloudapis.com/v2/token`
   - `grant_type=client_credentials`
   - Includes `account_id={mid}` when present to scope tokens to the BU context.
5. JIT provisioning:
   - Upserts Tenant by `{ eid, tssd }`.
   - Upserts User by `{ sfUserId, tenantId }`.
6. Token persistence:
   - Stores encrypted access and refresh tokens in Credentials keyed by `(tenantId, userId, mid)`.
7. Session establishment:
   - Sets `userId`, `tenantId`, and `mid`.
8. Redirect:
   - Responds `302` to `/` (frontend entry).

### 2) OAuth Authorization Code (redirect-based) — Enhanced Packages

This is the primary authentication flow for Enhanced Packages (created after ~2023). MCE does NOT post a JWT; instead, it loads the login endpoint directly in an iframe.

#### 2.1 Start: `GET /api/auth/login`

MCE loads this endpoint directly in an iframe when the user clicks the app in App Switcher.

1. Check if user already has a valid session → redirect to `/` immediately.
2. Resolve the target stack domain (`tssd`) from:
   - `?tssd=...` (validated), or
   - `MCE_TSSD` environment variable (validated)
3. Generate a random CSRF `state` value using `crypto.randomBytes(16)` and bind it to the current session:
   - Stored as `oauth_state_nonce`, `oauth_state_tssd`, `oauth_state_created_at`.
4. Redirect (302) to MCE OAuth authorize endpoint:
   - `https://{tssd}.auth.marketingcloudapis.com/v2/authorize?response_type=code&client_id=...&redirect_uri=...&state=...`

**Note:** The OAuth authorize page (`*.auth.marketingcloudapis.com`) sets `X-Frame-Options: DENY`, which temporarily blanks the iframe during the redirect chain. This is expected behavior—the browser navigates through the OAuth flow and returns to the callback.

#### 2.2 Callback: `GET /api/auth/callback`

After the user authorizes, MCE redirects back to this endpoint with `?code=...&state=...`.

1. Validate the `state` value against the session:
   - One-time use (consumed immediately)
   - Max age ~10 minutes
   - Nonce and TSSD must match session values
2. Exchange the authorization code for tokens:
   - `POST https://{tssd}.auth.marketingcloudapis.com/v2/token`
   - `grant_type=authorization_code`
3. If `sf_user_id` / `eid` / `mid` aren't provided by the platform, call:
   - `GET https://{tssd}.auth.marketingcloudapis.com/v2/userinfo`
   - Derive user, org, and BU identifiers.
4. Upsert Tenant and User, store encrypted tokens, set the session (`userId`, `tenantId`, `mid`).
5. Redirect (302) to `/` using NestJS `@Redirect()` decorator.

**Important:** The callback uses `@Redirect()` decorator with `return { url: '/', statusCode: 302 }` pattern—NOT `res.redirect()`. This is required for NestJS+Fastify to properly send a 302 response.

### Root Callback Handoff (MCE iframe)

In some MCE environments, the OAuth redirect may return to the app root (`/`) with `?code=...&state=...` rather than calling the API callback path directly. The API handles this by redirecting requests that arrive at `/` with OAuth parameters to `GET /api/auth/callback` (server-side), so:
- the authorization code exchange always happens server-to-server, and
- we avoid leaking `code`/`state` in frontend routing or client logs.

## Token Refresh

**Endpoint:** `GET /api/auth/refresh`

- Protected by `SessionGuard`; it does not accept `tenantId`/`userId`/`mid` from the browser.
- The backend loads the encrypted refresh token from DB (under RLS), decrypts it with `ENCRYPTION_KEY`, and exchanges it for a new access token when needed.
- Response is `{ ok: true }` (the browser does not need the token); the frontend calls this endpoint for “silent refresh” on 401s and then retries (see `apps/web/src/services/api.ts`).

## CSRF Protection (SameSite=None)

Because this app is embedded in an iframe, cookies must use `SameSite=None`, which means the API must implement explicit CSRF defenses for state-changing endpoints.

- The API issues a per-session `csrfToken` stored in the secure session and returned from `GET /api/auth/me` as `csrfToken`.
- State-changing endpoints (e.g. `POST /api/runs/*`) require the `x-csrf-token` header to match the session token (enforced by `apps/api/src/auth/csrf.guard.ts`).

## Why This Is Secure (What We Rely On)

Key security properties are implemented at the API boundary:

- **JWT integrity:** `jose.jwtVerify()` verifies signatures; we also restrict algorithms to `HS256` and require specific identity claims to be present.
- **Stack isolation:** `tssd` is validated with a strict `[a-z0-9-]+` allowlist before constructing any MCE domain URLs.
- **OAuth CSRF protection:** the redirect-based flow uses a random, session-bound `state` value that is short-lived (~10 min) and single-use. The nonce is generated using `crypto.randomBytes(16)` for sufficient entropy.
- **No browser token storage:** refresh tokens never reach the browser; they are stored encrypted in the database.
- **Defense in depth via RLS:** tenant + BU isolation is enforced by the database (including for accidental query mistakes).
- **Session security:** cookies are `HttpOnly` and `Secure`. `SameSite=None` is required for iframe-based embedding, so the API must be served over HTTPS.
- **Least authority endpoints:** refresh and "me" endpoints are session-protected; callers can't refresh tokens for arbitrary `tenantId`/`userId` values.
- **No OAuth secrets in logs:** request logging and error responses redact query strings to avoid leaking OAuth `code`/`state`.

## AppExchange Security Review Compliance

This implementation is designed to pass the Salesforce AppExchange security review. Key compliance points:

### Session Cookie Requirements (OWASP)
- **`Secure` flag:** Always set (required for `SameSite=None`); ensures cookies are only sent over HTTPS.
- **`HttpOnly` flag:** Always set; prevents JavaScript from reading the session cookie, mitigating XSS attacks.
- **Sufficient entropy:** Session IDs are generated by `@fastify/secure-session` using cryptographically secure randomness.
- **Unique per-session:** Each session gets a unique cookie value; cookies are never reused.
- **Session invalidation:** `session.delete()` is called on logout and re-authentication scenarios.

### OAuth Requirements
- **No SessionID exfiltration:** We never send Salesforce SessionIDs to external systems.
- **OAuth 2.0 Authorization Code flow:** Uses the recommended flow for web applications, not deprecated Device Flow.
- **CSRF protection:** All OAuth callbacks validate a session-bound, time-limited, single-use `state` parameter.
- **Server-to-server token exchange:** Authorization codes are exchanged server-side; tokens never reach the browser.

### Token Storage Requirements
- **Encryption at rest:** Access and refresh tokens are encrypted using AES-256-GCM via the `encrypt()`/`decrypt()` functions from `@qpp/database`.
- **No browser storage:** Tokens are stored server-side in the database, keyed by `(tenantId, userId, mid)`.
- **Encryption key management:** `ENCRYPTION_KEY` must be a 32-byte hex key stored securely (environment variable, not in code).

### Multi-Tenant Security
- **Row-Level Security (RLS):** Postgres enforces tenant + BU isolation at the database layer.
- **Per-request context:** RLS context (`app.tenant_id`, `app.mid`) is set on a reserved connection for each request.
- **No cross-tenant access:** Even application bugs cannot access other tenants' data due to RLS enforcement.

### OWASP Top 10 Mitigations
- **A01 Broken Access Control:** RLS + session guards enforce authorization.
- **A02 Cryptographic Failures:** AES-256-GCM for token encryption; TLS for data in transit.
- **A03 Injection:** Parameterized queries via Drizzle ORM; TSSD allowlist prevents URL injection.
- **A07 CSRF:** Session-bound, time-limited, single-use OAuth state tokens.

### External Integration Security
- **HTTPS only:** All MCE API calls use `https://{tssd}.auth.marketingcloudapis.com`.
- **Tenant-specific endpoints:** Uses customer's TSSD subdomain for multi-tenant AppExchange compatibility.
- **No debug mode:** Production deployments do not expose debug endpoints or verbose error messages.

## Configuration

Required environment variables:

- `MCE_CLIENT_ID`
- `MCE_CLIENT_SECRET`
- `MCE_REDIRECT_URI`
- `MCE_JWT_SIGNING_SECRET`
- `ENCRYPTION_KEY`
- `SESSION_SECRET`
- `SESSION_SALT`

Optional (recommended for stricter JWT validation if MCE provides these claims):

- `MCE_JWT_ISSUER`
- `MCE_JWT_AUDIENCE`
