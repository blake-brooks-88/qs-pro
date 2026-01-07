# Specification: MCE Bridge & Metadata Discovery

## Goal
Establish the core "Bridge" infrastructure to abstract secure communication with Salesforce Marketing Cloud Engagement and implement the initial metadata discovery services (Folders, Data Extensions, Fields) with caching and robust error handling.

## User Stories
- As a backend developer, I want a unified, stateless `MceBridgeService` that automatically handles TSSD resolution and token injection so I can focus on business logic.
- As an MCE Architect, I want to view my Data Extension folder hierarchy so I can navigate my assets.
- As an MCE Architect, I want to see all Data Extensions in my current Business Unit, including Shared Data Extensions from the Enterprise parent, to build queries effectively.
- As a system administrator, I want 3rd-party API errors to be normalized and system crashes to be reported to Sentry for quick troubleshooting.

## Specific Requirements

**MceBridgeService (Infrastructure)**
- **Stateless Design:** Must accept `tenantId` and `userId` as arguments for every request to ensure multi-tenant isolation.
- **Auth Integration:** Must call `AuthService.refreshToken(tenantId, userId)` to retrieve a valid access token before every request.
- **TSSD Resolution:** dynamically construct base URLs (`https://{tssd}.rest...` / `https://{tssd}.soap...`) based on the tenant's stored subdomain.
- **Error Normalization:** Intercept all `axios` errors and SOAP Faults, converting them into a standardized RFC 7807 `ProblemDetails` format.
- **SOAP Support:** Implement a lightweight XML builder/parser to handle MCE's SOAP envelopes.

**MetadataService (Feature Logic)**
- **Folder Discovery:** Implement `getFolders(tenantId, userId)` using SOAP `Retrieve` on `DataFolder` object (ContentType: dataextension).
- **DE Discovery:** Implement `getDataExtensions(tenantId, userId)` fetching both local DEs and Shared (Enterprise) DEs.
- **Shared Context:** Use the existing `tenants.eid` (Enterprise ID) as the `Client.ID` when retrieving Shared Data Extensions.
- **Field Schema:** Implement `getFields(tenantId, userId, deKey)` using SOAP `Retrieve` on `DataExtensionField`.
- **Caching:** Wrap all metadata calls with Redis caching (Folders: 10m, Fields: 30m) using keys like `mce:metadata:{type}:{tenantId}:{buId}`.

**Observability & Logging**
- **Sentry Integration:** Configure a global exception filter to send 500-level errors (System/Crash) to Sentry.
- **Local Logging:** Log 400-level errors (User/Business Logic) to standard output (JSON format) for debugging without alerting.

**Verification UI**
- **Simple HTML:** Create a basic, unstyled HTML page (`/verify-metadata`) to list folders and DEs, proving the API endpoints work.

## Visual Design
No visual assets provided.

## Existing Code to Leverage

**apps/api/src/auth/auth.service.ts**
- Use `refreshToken(tenantId, userId)` to securely retrieve access tokens without duplicating encryption logic.
- Reuse `ConfigService` injection pattern for accessing environment variables.

**apps/api/src/app.module.ts**
- Register the new `MceBridgeModule` and `MetadataModule` here to expose them to the application.

**packages/database**
- Reuse the `ITenantRepository` pattern if tenant lookups are needed outside of the `AuthService` (though `AuthService` handles most).

## Out of Scope
- **Frontend Sidebar:** No React implementation of the sidebar or Redux/Zustand stores.
- **Query Execution:** No implementation of SQL execution or "Run to Temp".
- **Pass-through Proxy:** The streaming proxy implementation is a separate future phase; this is just the internal service layer.
- **Drag-and-Drop:** No UI interactions.
