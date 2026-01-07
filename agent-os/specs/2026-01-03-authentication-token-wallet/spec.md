# Specification: Authentication & Token Wallet

## Goal
Implement a secure, multi-tenant OAuth 2.0 flow for Salesforce Marketing Cloud Engagement (MCE) AppExchange integration, featuring a "Token Wallet" that persists encrypted refresh tokens using AES-256-GCM.

## User Stories
- As a MCE Architect, I want to securely log in to Query++ using my Marketing Cloud credentials so that I can access my Data Extensions and queries.
- As a Campaign Manager, I want the application to stay authorized as I switch between Business Units so that I don't have to repeatedly log in.
- As a Security Officer, I want refresh tokens to be encrypted at rest so that our organization remains compliant with ISV security standards.

## Specific Requirements

**MCE OAuth 2.0 Handshake (Web App)**
- Implement the Authorization Code Flow (`v2/authorize` and `v2/token`) specifically for AppExchange Partner applications.
- Dynamically handle the Tenant-Specific Subdomain (TSSD) base URIs provided during the authorization redirect.
- Ensure the handshake supports multi-tenant deployments where the same Client ID and Secret are used across different MCE stacks.

**Token Wallet Persistence (CRITICAL ARCHITECTURE)**
- **Repository Layer:** Implement a strict Repository Pattern. Create `ICredentialsRepository`, `ITenantRepository`, and `IUserRepository` interfaces. All DB retrieval must happen here.
- **Service Layer:** Implement `AuthService` to handle the business logic of OAuth exchange, token encryption, and repository orchestration.
- **Controller Layer:** Implement `AuthController` to expose REST endpoints.
- **Data Isolation:** Link all credentials to the corresponding `tenants` and `users` entities.

**Frontend Integration & UI Components**
- Use `shadcn/ui` for all reusable UI components (e.g., Modals, Toasts, Cards, Inputs).
- Implement a login screen using `shadcn/ui` form patterns.
- Ensure all components follow the "Spectra Kinetic" dark mode styling.
- **Note:** Do NOT write tests for standard `shadcn/ui` components; only test custom business logic and state management.

**Encryption Security (AES-256-GCM)**
- Use the established `encrypt` and `decrypt` utilities in `packages/database/src/crypto.ts` for all refresh tokens.
- Manage the 256-bit encryption key via the `ENCRYPTION_KEY` environment variable in the NestJS backend.
- Ensure the IV and Auth Tag are stored alongside the ciphertext (handled by the existing crypto utility).

**Quiet Re-authentication (Refresh Flow)**
- Implement backend logic to automatically exchange a refresh token for a new access token when the current one is nearing expiration.
- Expose a `/auth/refresh` endpoint that the frontend can call if an API request returns a 401 Unauthorized status.
- Ensure the refresh process is transparent to the user, preventing session interruptions during active query development.

**Multi-MID Context Awareness**
- Extract and store the Business Unit MID from the MCE ID Token or via a post-auth "UserInfo" call.
- Implement logic to detect when a user has switched Business Units in the MCE UI (via the `login` or `logout` endpoints) and re-authenticate as needed.
- Ensure the backend service can resolve the correct TSSD for any given MID/Tenant context.

**Auth API Endpoints**
- `GET /auth/login`: Initiates the OAuth handshake with MCE.
- `GET /auth/callback`: Processes the authorization code, exchanges it for tokens, and performs the initial "Token Wallet" save.
- `GET /users/me`: Returns the current user's profile, active MID, and tenant information.

**Verification & Smoke Testing**
- Include Vitest unit tests for the `AuthService` covering encryption/decryption and token exchange logic.
- Implement a "Smoke Test" API call (e.g., retrieving the authenticated user's details from MCE) to verify token validity before finalizing the session.

## Visual Design
No visual assets provided. The authentication flow should follow standard MCE AppExchange redirect patterns, and any error states or "Session Expired" notifications should use the "Spectra Kinetic" dark mode styling.

## Existing Code to Leverage

**`packages/database/src/schema.ts`**
- Leverage the `tenants`, `users`, and `credentials` tables already defined in the schema.
- Use the generated Zod schemas (e.g., `insertCredentialsSchema`) for data validation.

**`packages/database/src/crypto.ts`**
- Use the `encrypt` and `decrypt` functions for securing refresh tokens.

**`apps/api/src/auth`**
- Refactor the existing `MceStrategy` and `AuthService` placeholders to implement the full AppExchange OAuth flow.

## Out of Scope
- Integration with SAML, LDAP, or other external identity providers.
- Manual "Linked Accounts" management UI (auth is tied to the active MCE session).
- Full Automation Studio activity deployment (reserved for Phase 7).
- Advanced permission/role management beyond basic tenant-level isolation.
