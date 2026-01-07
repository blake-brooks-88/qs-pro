# Specification: MCE Native SSO Integration

## Goal
Shift the application's authentication from a standalone OAuth2 flow to a platform-native SSO flow initiated via the Salesforce Marketing Cloud Engagement App Switcher. This ensures seamless access for MCE users and compliance with AppExchange standards.

## User Stories
- As an MCE Architect, I want to launch Query++ directly from the MCE App Switcher so that I don't have to manage separate credentials.
- As a Campaign Manager, I want my tenant and user records to be automatically provisioned on my first login so that I can start working immediately without manual setup.

## Specific Requirements

**JWT Receiver Endpoint**
- Implement a `POST /auth/login` endpoint in `AuthController` to handle the signed JWT posted by MCE.
- This endpoint must be the "Login URL" configured in the MCE Installed Package.
- Ensure the endpoint supports CORS or is accessible via the MCE iframe.

**JWT Verification & Parsing**
- Use the `jose` library to verify the JWT signature using the `MCE_JWT_SIGNING_SECRET` environment variable.
- Extract `user_id`, `enterprise_id` (EID), and `member_id` (MID) from the JWT payload.
- Extract the `stack` or `base_url` context to resolve the Tenant Specific Subdomain (TSSD).

**Just-In-Time (JIT) Provisioning**
- Use `DrizzleTenantRepository.upsert` to ensure the `Tenant` record exists based on the EID and TSSD.
- Use `DrizzleUserRepository.upsert` to ensure the `User` record exists based on the `sfUserId` (from JWT) and `tenantId`.
- Records should be updated if they already exist to reflect any changes in user metadata (email, name).

**Web App OAuth Handshake**
- Perform a server-to-server OAuth exchange using the context extracted from the JWT.
- Use the `MCE_CLIENT_ID` and `MCE_CLIENT_SECRET` to obtain initial access and refresh tokens.
- Store the encrypted tokens in the "Token Wallet" (Credentials table) using `AuthService.saveTokens`.

**Tenant-Aware Session Management**
- Upon successful JWT verification and token handshake, establish a secure HTTP-only session cookie for the browser.
- The session must contain the `userId` and `tenantId` to ensure all subsequent API requests are scoped correctly.
- Ensure the session persists across page reloads within the MCE iframe.

**UI Cleanup & Redirection**
- Remove the existing manual login page and "Login with Salesforce" button from the frontend.
- Configure the application to redirect unauthenticated requests to an informative "Please launch from Marketing Cloud" page or handle the handshake automatically if triggered.
- After a successful login handshake, redirect the user to the main "Verifier" page.

## Existing Code to Leverage

**AuthService (apps/api/src/auth/auth.service.ts)**
- Reuse `saveTokens` for encrypted token persistence and `getUserInfo` patterns for identity discovery.
- Extend `handleCallback` logic to support the JWT-based handshake flow.

**MceBridgeService (apps/api/src/mce/mce-bridge.service.ts)**
- Reference the `request` and `soapRequest` wrappers for how TSSD and access tokens are used for MCE API calls.

**Drizzle Repositories (packages/database/src/repositories/drizzle-repositories.ts)**
- Utilize existing `upsert` methods in `DrizzleTenantRepository` and `DrizzleUserRepository` for JIT provisioning.

**Database Schema (packages/database/src/schema.ts)**
- Ensure the `tenants`, `users`, and `credentials` schemas accommodate the EID, MID, and TSSD fields correctly.

## Out of Scope
- Support for in-app Business Unit (MID) switching (handled by re-launching from MCE).
- Manual credential management or "Forgot Password" flows.
- Multi-factor authentication (MFA) within the app (handled by MCE).
- Support for non-MCE SSO providers.
