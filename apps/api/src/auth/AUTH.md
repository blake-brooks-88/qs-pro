# API Authentication (MCE)

This API authenticates users launching the app from Salesforce Marketing Cloud Engagement (MCE) and establishes a server-side session that the frontend uses for subsequent API calls.

## Summary

We support two entry points:

1. **MCE App Switcher SSO (JWT → server-to-server token exchange)**
   - `POST /api/auth/login` receives an MCE-signed JWT from the MCE iframe.
   - The API verifies the JWT signature, extracts identity + stack (`tssd`), performs an OAuth token exchange, stores tokens, and sets a secure session cookie.

2. **OAuth Authorization Code flow (redirect-based)**
   - `GET /api/auth/login` redirects the browser to `https://{tssd}.auth.marketingcloudapis.com/v2/authorize`.
   - `GET /api/auth/callback` receives the authorization code, exchanges it for tokens, stores tokens, and sets a secure session cookie.

After either entry point, authenticated requests are authorized via the session cookie (not by passing access tokens from the browser).

## How Sessions Work

Sessions are handled by `@fastify/secure-session` in `apps/api/src/main.ts`.

- Cookie settings (current defaults):
  - `httpOnly: true` prevents JavaScript from reading the cookie.
  - `secure: true` requires HTTPS (required for production).
  - `sameSite: 'none'` allows cookies in an MCE iframe embed.
- Session contents:
  - `userId` (internal DB user id)
  - `tenantId` (internal DB tenant id)
- Authorization:
  - `apps/api/src/auth/session.guard.ts` enforces presence of `userId` and `tenantId` in the session and attaches `{ userId, tenantId }` onto `request.user`.

## Token Storage (“Token Wallet”)

Tokens are stored server-side in the database (Credentials table).

- Access token: stored as plaintext in DB for server-side API calls.
- Refresh token: stored encrypted at rest using AES-256-GCM via `encrypt()`/`decrypt()` from `@qs-pro/database`.
- Access token: stored encrypted at rest using the same AES-256-GCM mechanism; decrypted only just-in-time for outbound MCE API calls.
- Encryption key:
  - `ENCRYPTION_KEY` must be a stable 32-byte hex key (as required by `@qs-pro/database`).

The browser never receives refresh tokens.

## Flows in Detail

### 1) MCE App Switcher JWT SSO

**Endpoint:** `POST /api/auth/login`

**Code:** `apps/api/src/auth/auth.controller.ts` → `AuthService.handleJwtLogin()`

1. MCE loads the app in an iframe and posts a signed JWT to the backend.
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
   - Stores access token and encrypted refresh token in Credentials.
7. Session establishment:
   - Clears any existing session data and sets `userId` and `tenantId`.
8. Redirect:
   - Responds `302` to `/` (frontend entry).

### 2) OAuth Authorization Code (redirect-based)

This is a redirect-based OAuth flow useful for initial authorization and local verification.

#### 2.1 Start: `GET /api/auth/login`

1. Resolve the target stack domain (`tssd`) from:
   - `?tssd=...` (validated), or
   - `MCE_TSSD` (validated)
2. Generate a random CSRF `state` value and bind it to the current session:
   - Stored as `oauth_state_nonce`, `oauth_state_tssd`, `oauth_state_created_at`.
3. Redirect to:
   - `https://{tssd}.auth.marketingcloudapis.com/v2/authorize?...&state=...`

#### 2.2 Callback: `GET /api/auth/callback`

1. Validate the `state` value against the session (one-time, max age ~10 minutes).
2. Exchange the authorization code for tokens:
   - `POST https://{tssd}.auth.marketingcloudapis.com/v2/token`
   - `grant_type=authorization_code`
3. If `sf_user_id` / `eid` aren’t provided by the platform, call:
   - `GET https://{tssd}.auth.marketingcloudapis.com/v2/userinfo`
   - Derive user + org identifiers.
4. Upsert Tenant and User, store tokens, set the session (`userId`, `tenantId`), and redirect to `/`.

## Token Refresh

**Endpoint:** `GET /api/auth/refresh`

- Protected by `SessionGuard`; it does not accept `tenantId`/`userId` from the browser.
- The backend loads the encrypted refresh token from DB, decrypts it with `ENCRYPTION_KEY`, and exchanges it for a new access token when needed.
- The frontend uses this endpoint for “silent refresh” on 401s (see `apps/web/src/services/api.ts`).

## Why This Is Secure (What We Rely On)

Key security properties are implemented at the API boundary:

- **JWT integrity:** `jose.jwtVerify()` verifies signatures; we also restrict algorithms to `HS256` and require specific identity claims to be present.
- **Stack isolation:** `tssd` is validated with a strict `[a-z0-9-]+` allowlist before constructing any MCE domain URLs.
- **OAuth CSRF protection:** the redirect-based flow uses a random, session-bound `state` value that is short-lived and single-use.
- **No browser token storage:** refresh tokens never reach the browser; they are stored encrypted in the database.
- **Session security:** cookies are `HttpOnly` and `Secure`. `SameSite=None` is required for iframe-based embedding, so the API must be served over HTTPS.
- **Least authority endpoints:** refresh and “me” endpoints are session-protected; callers can’t refresh tokens for arbitrary `tenantId`/`userId` values.

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
