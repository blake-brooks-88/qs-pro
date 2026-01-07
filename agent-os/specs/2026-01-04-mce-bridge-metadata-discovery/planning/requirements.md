# Spec Requirements: MCE Bridge & Metadata Discovery

## Initial Description
Define the specification for a "Bridge" infrastructure in NestJS that abstracts all communication with Salesforce Marketing Cloud Engagement, followed by the iterative implementation of metadata discovery services.

## Requirements Discussion

### First Round Questions

**Q1:** I assume we should use `axios` as the underlying HTTP client for the Bridge, wrapped in a NestJS Service. Is that correct?
**Answer:** Yes, `axios` is a great option.

**Q2:** What exactly is the purpose of the bridge? I want to keep a solid separation of concerns.
**Answer:** The user emphasized keeping domains specific. The "Bridge" should be a utility/infrastructure layer, not a "god object." Specific features (like Metadata) should have their own services that *use* the Bridge for communication, rather than the Bridge containing business logic for every domain.

**Q3:** How should we handle secure token access (AuthService vs Bridge)?
**Answer:** Best practices confirm the `AuthService` should remain the single source of truth for token management (decryption/refresh). The Bridge should request a valid token from `AuthService` for each request. This keeps the Bridge stateless and secure.

**Q4:** Error Normalization & Logging Strategy?
**Answer:**
- **Format:** Use RFC 7807 (Problem Details for HTTP APIs).
- **Sentry:** The user wants to follow best practices for 3rd-party API observability.
    - *Research Finding:* Best practice is to **exclude** expected "Business Logic" errors (4xx, user invalid queries) from Sentry to avoid noise. Sentry should capture **Application/System** errors (5xx, crashes, or unexpected 3rd-party outages).
    - *Action:* Configure Global Filter to log 4xx locally but send 5xx to Sentry.

**Q5:** Identifying "Shared" (ENT) Data Extensions and Parent MID?
**Answer:**
- *Research Finding:* To retrieve shared items, we MUST know the Parent MID and use `Client.ID = ParentMID` + `QueryAllAccounts = true`.
- *Strategy:* We can retrieve the "Account" object for the current user's session. The `Account` object contains a `ParentID` property. We should fetch this once during the initial discovery/session setup and cache it.

**Q6:** Caching Strategy & Redis Keys?
**Answer:** Use Redis with keys like `mce:metadata:folders:{tenantId}:{buId}`.

**Q7:** Exclusions?
**Answer:** The frontend for this phase is strictly a simple "verification" UI (HTML/list) to prove the API works. No polished UI or full sidebar implementation yet.

### Existing Code to Reference
No similar existing features identified for reference.

### Follow-up Questions

**Q1:** Shared DE Retrieval - Parent MID detection?
**Answer:** We should attempt to auto-detect the Parent MID during the initial auth/discovery process if possible. (Research confirms this is possible via the `Account` object).

**Q2:** Sentry for 3rd Party APIs?
**Answer:** Confirmed best practice:
- **User Errors (4xx):** Log to standard application logs (stdout/json) for debugging but DO NOT send to Sentry.
- **System Errors (5xx/Network):** Send to Sentry for alerting.

**Q3:** Bridge calling `AuthService.getValidToken`?
**Answer:** Confirmed as acceptable and secure.

## Visual Assets
No visual assets provided.

## Requirements Summary

### Architectural Requirements (The Bridge)
- **Tech Stack:** NestJS, `axios` (wrapped), `AuthService` integration.
- **Core Responsibility:**
    - **TSSD Resolution:** Dynamic URL construction (`https://{tssd}.rest...`).
    - **Auth Injection:** Call `AuthService.getAccessToken()` and inject `Authorization: Bearer` header.
    - **Error Normalization:** Catch `axios` errors (REST) and SOAP Faults. Convert ALL to RFC 7807 format.
- **Statelessness:** Must not store state. Accepts `tenantId` and `userId` as method arguments (or context).

### Functional Requirements (Metadata Services)
- **Domain Separation:** Create a dedicated `MetadataService` (uses Bridge) rather than putting logic *in* the Bridge.
- **Iteration 1 (Folders):** Fetch `DataFolder` (SOAP). Cache for 10m.
- **Iteration 2 (DEs):** Fetch `DataExtension` (SOAP).
    - *Logic:* Fetch Local DEs (current MID) AND Shared DEs (Parent MID).
    - *Parent MID:* Resolve via `Account` object lookup if not known.
- **Iteration 3 (Fields):** Fetch `DataExtensionField` (SOAP). Lazy-load by DE Key. Cache for 30m.

### Observability & Logging
- **Standard:** RFC 7807 for error responses.
- **Sentry:** Enable for 500-level errors and unexpected crashes.
- **Logs:** Structured logs (JSON) for all 3rd-party interactions (request/response summary) for debugging 4xx errors without alerting.

### Scope Boundaries
**In Scope:**
- `MceBridgeService` (Infrastructure)
- `MetadataService` (Feature Logic)
- Redis Caching integration
- Simple HTML/Verify UI for testing

**Out of Scope:**
- Polished Sidebar UI
- Drag-and-drop features
- Query Execution
- "Pass-through" proxy (this is the *foundation* for it, not the full proxy yet).

### Technical Considerations
- **Parent MID:** Need a reliable way to fetch `ParentID` from the `Account` object for Enterprise accounts.
- **SOAP vs REST:** Metadata is primarily SOAP. The Bridge must handle XML envelopes and parsing (likely using a lightweight XML builder/parser or templates).
