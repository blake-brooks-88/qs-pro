# Task Breakdown: Authentication & Token Wallet

## Overview
Total Tasks: 15

## Task List

### Database & Logic Layer

#### Task Group 1: Repositories & Encryption
**Dependencies:** None

- [x] 1.0 Complete database and encryption logic
  - [x] 1.1 Write 3 focused tests for repository and crypto logic
    - Test `CredentialsRepository.upsert`
    - Test `Crypto.encrypt/decrypt`
    - Test `TenantRepository.findByEid`
  - [x] 1.2 Implement Repository Interfaces
    - `ICredentialsRepository`, `ITenantRepository`, `IUserRepository`
  - [x] 1.3 Implement Concrete Drizzle Repositories
    - Implement methods for CRUD operations on tokens, tenants, and users
  - [x] 1.4 Register Repositories as Providers
    - Setup in `AuthModule` using interface tokens
  - [x] 1.5 Ensure database layer tests pass
    - Run ONLY the 3 tests written in 1.1

### API Layer

#### Task Group 2: Services & Controllers
**Dependencies:** Task Group 1

- [x] 2.0 Complete Backend Service and API layer
  - [x] 2.1 Setup MSW for API Mocking
    - Configure MSW handlers for MCE Auth (`/v2/authorize`, `/v2/token`)
    - Ensure handlers return realistic success and error payloads
  - [x] 2.2 Write 5 focused tests for AuthService using MSW
    - Test token exchange via MSW interceptors
    - Test quiet refresh flow behavior
    - Test TSSD resolution logic
  - [x] 2.3 Implement `AuthService`
    - Logic for MCE OAuth flow, token encryption, and repository orchestration
  - [x] 2.4 Implement `AuthController`
    - Endpoints: `GET /auth/login`, `GET /auth/callback`, `GET /auth/refresh`
  - [x] 2.5 Implement `UserController`
    - Endpoint: `GET /api/users/me` (requires auth guard)
  - [x] 2.6 Ensure API layer tests pass
    - Run ONLY the 5 tests written in 2.2

**Acceptance Criteria:**
- Successful OAuth handshake using Repositories
- Tokens saved correctly via `CredentialsRepository`
- Quiet refresh flow functional

### Frontend Design

#### Task Group 3: shadcn/ui & Auth Integration
**Dependencies:** Task Group 2

- [x] 3.0 Complete Frontend UI & Auth Integration
  - [x] 3.1 Write 3 focused tests for auth state management
    - Test `useAuthStore` initialization from `GET /users/me`
    - Test handling 401 errors by triggering a refresh
  - [x] 3.2 Initialize shadcn/ui components
    - Install and configure `shadcn/ui` (Button, Card, Input, Toast, Modal)
    - No tests required for these base components
  - [x] 3.3 Implement `useAuthStore` (Zustand)
    - Store user profile and tenant info
  - [x] 3.4 Create Login & Auth Interceptors
    - Implement login screen with shadcn/ui `Card` and `Button`
    - Add Axios/Fetch interceptor to handle silent token refresh
  - [x] 3.5 Implement "Session Expired" notification
    - Use shadcn/ui `Toast` component
  - [x] 3.6 Ensure auth logic tests pass
    - Run ONLY the 3 tests written in 3.1

**Acceptance Criteria:**
- shadcn/ui components are used for the Auth UI
- App handles 401s silently via the refresh token
- Login state is persisted in Zustand store


### Testing

#### Task Group 4: Test Review & Gap Analysis
**Dependencies:** Task Groups 1-3

- [x] 4.0 Final Verification & Smoke Test
  - [x] 4.1 Review tests from Task Groups 1-3 (Total: 11 tests)
  - [x] 4.2 Analyze coverage for the "Smoke Test" requirement
    - Identify if we need an integration test that actually calls a (mocked) MCE API
  - [x] 4.3 Write a final "Smoke Test" integration test
    - Mock MCE API response and verify the app can retrieve data using a stored token
  - [x] 4.4 Run all 12 feature-specific tests

**Acceptance Criteria:**
- All 12 feature-specific tests pass
- The "Smoke Test" proves the end-to-end viability of the token wallet
- Zero manual re-auth required during valid refresh periods