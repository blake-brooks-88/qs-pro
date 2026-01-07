# Task Breakdown: MCE Bridge & Metadata Discovery

## Overview
Total Tasks: 12

## Task List

### Backend Layer

#### Task Group 1: MceBridgeService (Infrastructure)
**Dependencies:** None

- [x] 1.0 Complete Bridge Infrastructure
  - [x] 1.1 Write 2-8 focused tests for Bridge functionality
    - Limit to 2-8 highly focused tests maximum
    - Test: Token injection (calls AuthService), TSSD URL construction, SOAP envelope builder, and Error Normalization (axios -> ProblemDetails)
  - [x] 1.2 Implement `MceBridgeService` class
    - Implement `refreshToken` call integration
    - Create `request` method wrapping axios with interceptors
    - Implement `buildSoapEnvelope` utility
  - [x] 1.3 Implement Error Normalization Interceptor
    - Catch axios 4xx/5xx and SOAP Faults
    - Transform into RFC 7807 JSON structure
  - [x] 1.4 Register `MceBridgeModule`
    - Export service for other modules
    - Import into `AppModule`
  - [x] 1.5 Ensure Bridge tests pass
    - Run ONLY the 2-8 tests written in 1.1
    - Verify robust error handling and token injection

**Acceptance Criteria:**
- Tests pass for token injection and URL construction
- SOAP envelopes are correctly formatted
- MCE Errors are normalized to RFC 7807
- Service is stateless (accepts tenantId/userId)

#### Task Group 2: MetadataService (Feature Logic)
**Dependencies:** Task Group 1

- [x] 2.0 Complete Metadata Service
  - [x] 2.1 Write 2-8 focused tests for Metadata discovery
    - Limit to 2-8 highly focused tests maximum
    - Test: `getFolders` (mocked response), `getDataExtensions` (mocked shared/local split), `getFields` caching logic
  - [x] 2.2 Implement `getFolders` (SOAP Retrieve)
    - Object: `DataFolder`, Filter: `ContentType=dataextension`
    - Cache: 10 minutes in Redis
  - [x] 2.3 Implement `getDataExtensions` (Local + Shared)
    - Call 1: Local Context (standard retrieve)
    - Call 2: Shared Context (Retrieve with `Client.ID` = `tenants.eid`)
    - Merge results
  - [x] 2.4 Implement `getFields` (Lazy Loading)
    - Object: `DataExtensionField`, Filter: `DataExtension.CustomerKey`
    - Cache: 30 minutes in Redis
  - [x] 2.5 Ensure Metadata tests pass
    - Run ONLY the 2-8 tests written in 2.1
    - Verify caching works (second call hits cache)
    - Verify Shared DE logic uses correct ClientID

**Acceptance Criteria:**
- Folders and DEs are retrieved correctly
- Shared DEs are fetched using the correct Enterprise ID context
- Caching reduces API calls on subsequent requests
- All responses are strongly typed

### API Layer

#### Task Group 3: Controllers & Observability
**Dependencies:** Task Group 2

- [x] 3.0 Complete API Endpoints
  - [x] 3.1 Write 2-8 focused tests for Metadata Controller
    - Limit to 2-8 highly focused tests maximum
    - Test: Endpoints return 200 OK with correct JSON structure
    - Test: Global Exception Filter catches 500s (mocked Sentry)
  - [x] 3.2 Create `MetadataController`
    - GET `/metadata/folders`
    - GET `/metadata/data-extensions`
    - GET `/metadata/fields/:key`
  - [x] 3.3 Implement Sentry Global Filter
    - Capture 500s -> Sentry
    - Log 400s -> Console (JSON)
  - [x] 3.4 Ensure API tests pass
    - Run ONLY the 2-8 tests written in 3.1
    - Verify endpoints are accessible and protected (AuthGuard)

**Acceptance Criteria:**
- Endpoints return metadata in expected format
- 4xx errors are logged locally, 5xx sent to Sentry
- AuthGuard protects all routes

### Frontend Verification

#### Task Group 4: Simple Verification UI
**Dependencies:** Task Group 3

- [x] 4.0 Create Verification Page
  - [x] 4.1 Write 2-4 focused tests for Verification Page
    - Test: Renders list of items
    - Test: Fetching data triggers API call
  - [x] 4.2 Create simple HTML/React Page (`/verify-metadata`)
    - Button: "Load Folders" (Displays JSON/List)
    - Button: "Load DEs" (Displays JSON/List)
    - Input: DE Key + Button "Load Fields"
  - [x] 4.3 Ensure Verification tests pass
    - Run ONLY the tests from 4.1
    - Verify data loading works

**Acceptance Criteria:**
- User can click buttons to see API responses
- proves that the backend logic is sound

## Execution Order
1. Backend Layer (Task Group 1: Bridge Infrastructure)
2. Backend Layer (Task Group 2: Metadata Service)
3. API Layer (Task Group 3: Controllers & Observability)
4. Frontend Verification (Task Group 4)
