# Task Breakdown: MCE Native SSO Integration

## Overview
Total Tasks: 15

## Task List

### Database Layer

#### Task Group 1: Repository Enhancements
**Dependencies:** None

- [x] 1.0 Complete database layer updates
  - [x] 1.1 Write 2-4 focused tests for Tenant/User upsert logic
    - Verify `onConflictDoUpdate` behavior for EID and SfUserId
    - Test correct TSSD and User Metadata updates
  - [x] 1.2 Ensure `DrizzleTenantRepository` handles `upsert` with EID and TSSD
    - Target: `tenants.eid`
    - Update: `tssd`
  - [x] 1.3 Ensure `DrizzleUserRepository` handles `upsert` with SfUserId and User Metadata
    - Target: `users.sfUserId`
    - Update: `email`, `name`, `tenantId`
  - [x] 1.4 Ensure database layer tests pass
    - Run only the tests written in 1.1
    - Verify upsert operations work as expected

**Acceptance Criteria:**
- Tenant and User records are correctly provisioned or updated on conflict.
- Database tests for repository upsert logic pass.

### API Layer

#### Task Group 2: JWT Authentication & Handshake
**Dependencies:** Task Group 1 - jose installed already using (pnpm --filter api add jose)

- [x] 2.0 Complete JWT Authentication layer
  - [x] 2.1 Write 4-6 focused tests for JWT verification and context extraction
    - Test valid JWT signature with `MCE_JWT_SIGNING_SECRET`
    - Test invalid signature and expired token handling
    - Test correct extraction of EID, MID, UserID, and TSSD context
  - [x] 2.2 Implement `POST /auth/login` endpoint in `AuthController`
    - Receive JWT from MCE request body
    - Verify signature using `jose`
  - [x] 2.3 Implement JIT Provisioning logic in `AuthService`
    - Call `TenantRepo.upsert` and `UserRepo.upsert` with JWT context
  - [x] 2.4 Implement Web App OAuth Handshake
    - Exchange JWT context and Client credentials for access/refresh tokens
    - Store encrypted tokens in `Credentials` table
  - [x] 2.5 Establish secure HTTP-only session cookie
    - Set `userId` and `tenantId` in the session
  - [x] 2.6 Ensure API layer tests pass
    - Run tests from 2.1
    - Verify end-to-end handshake from JWT post to session creation

**Acceptance Criteria:**
- JWT is verified correctly using the configured secret.
- Tenants and Users are auto-provisioned upon login.
- OAuth tokens are successfully exchanged and stored.
- Secure session cookie is issued.

### Frontend Layer

#### Task Group 3: UI Cleanup & Flow
**Dependencies:** Task Group 2

- [x] 3.0 Complete Frontend integration
  - [x] 3.1 Remove manual Login page and "Login with Salesforce" button
    - Clean up `LoginView` or equivalent component
  - [x] 3.2 Update `App` entry point or Protected Routes
    - Ensure unauthenticated requests redirect to a "Launch from Marketing Cloud" instruction
  - [x] 3.3 Implement auto-redirection to "Verifier" page
    - After successful handshake, the user should land on the verification UI
  - [x] 3.4 Ensure frontend smoke tests pass
    - Verify redirection logic and removal of old login UI

**Acceptance Criteria:**
- Old login UI is removed.
- App redirects correctly based on authentication state.
- Post-login landing page is the "Verifier" page.

### Testing

#### Task Group 4: Final Verification
**Dependencies:** Task Groups 1-3

- [x] 4.0 Final Verification and Gap Analysis
  - [x] 4.1 Review tests from Task Groups 1-3
  - [x] 4.2 Write up to 5 strategic integration tests
    - Focus on the full flow from MCE JWT POST to MCE API call via `MceBridgeService`
  - [x] 4.3 Run all feature-specific tests
    - Verify full SSO flow and session persistence

**Acceptance Criteria:**
- All 15+ feature-specific tests pass.
- Full E2E flow from MCE App Switcher to Query++ interface works as intended.

## Execution Order

Recommended implementation sequence:
1. Repository Enhancements (Task Group 1)
2. JWT Authentication & Handshake (Task Group 2)
3. UI Cleanup & Flow (Task Group 3)
4. Final Verification (Task Group 4)
