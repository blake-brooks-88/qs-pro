# Spec Requirements: Shell Query Engine (Backend)

## Initial Description
Context:
  We are building a "Zero-Data Proxy" SQL IDE for Salesforce Marketing Cloud
  Engagement (MCE). We need to implement the backend orchestration layer that
  allows users to execute ad-hoc SQL queries. Since MCE doesn't support direct
  SQL console execution, we use a "Shell" pattern (Temp DE + Query Activity).

  Architectural Requirements:
   1. NestJS Worker: Refactor apps/worker into a NestJS application to share
      MceModule (SOAP/REST bridge), DatabaseModule (Drizzle/RLS), and
      AuthModule (Token encryption) with the API.
   2. BullMQ Orchestration: Use BullMQ + Redis for job durability. The API will
      act as the Producer, and the Worker will act as the Consumer. Jobs must
      carry full tenant context (tenantId, userId, mid) to maintain RLS
      isolation.
   3. Flow Strategy Pattern: Implement an IFlowStrategy interface to handle
      different execution paths. 
       - `RunToTempFlow`: Create Temp DE (24h retention) -> Create Query
         Activity -> Start -> Poll for Status -> Stream Results -> Cleanup.
       - `RunToTargetFlow`: Execute SQL into an existing user-defined Data
         Extension.
   4. Zero-Data Proxy Streaming: Do NOT persist query results in our database.
      The Worker should fetch pages from MCE and push them to a Redis Pub/Sub
      channel. The API should subscribe to this channel and stream results to
      the UI via Server-Sent Events (SSE).
   5. Asset Recycling: The worker must handle the "Recycling" of temporary MCE
      assets (deleting the Temp DE and Query Activity) after execution or if
      the job fails.

  Technical Stack:
   - Backend: NestJS (Fastify), BullMQ, Redis.
   - Database: PostgreSQL (Drizzle ORM) with Row Level Security (RLS).
   - MCE Bridge: Existing SOAP/REST utility in apps/api/src/mce.

## Requirements Discussion

### First Round Questions

**Q1:** I’m assuming every run/job is fully scoped by `(tenantId, userId, mid)` plus whatever we use to resolve auth tokens (e.g., connectionId / installId). Is that correct, or do we also need additional context (enterprise MID, parent MID, etc.) on the job payload?
**Answer:** You need (tenantId, userId, mid) plus the Connection context and the `snippetName`.
Details: The payload must include the name of the snippet being executed. This allows the worker to generate a human-readable Data Extension name. Including enterpriseId (EID) remains a best practice for enterprise-scope system views.

**Q2:** For `RunToTempFlow`, I’m assuming we create *both* the Temp DE and a QueryDefinition, then `Start` it, then read results via REST rowset. Is that the exact MCE API path you want, or should we rely on different endpoints for results retrieval?
**Answer:** SOAP Create (Folder) -> SOAP Create (Temp DE) -> SOAP Create (Query) -> SOAP Perform -> Poll -> REST Rowset.
Naming Convention:
  Named Snippet: QPP_[SnippetName]_[Hash] (e.g., QPP_ActiveUsers_a8f2)
  Untitled Snippet: QPP_Results_[Hash] (e.g., QPP_Results_d3k9)
Details: The worker must first ensure a folder named "QueryPlusPlus Results" exists (auto-create if missing). All temporary assets are placed here. The Hash (first 4 chars of runId) ensures uniqueness so users can run the same snippet multiple times without naming collisions.

**Q3:** For `RunToTargetFlow`, I’m assuming we still run via QueryDefinition but target an existing DE (and optionally create/update its schema elsewhere). Should this flow be allowed to create the target DE if it doesn’t exist, or must it only write to pre-existing DEs?
**Answer:** It should only write to pre-existing DEs (managed via the Target Wizard).
Details: Even if a snippet is named, the "Run to Target" flow assumes the user has already selected or created a permanent destination DE. This keeps the engine focused on execution rather than schema management.

**Q4:** For streaming, I’m assuming the worker publishes page-based events like `{ runId, page, rows, done }` into Redis, and the API translates that into SSE events for the UI. What page size + max rows/time limits should we enforce by default (e.g., 50/100 rows per page, cap at N pages, hard timeout at N minutes)?
**Answer:** Execution: Worker runs the SQL into the Temp DE and notifies the UI when "Ready."
Retrieval: The API provides a paginated endpoint (/results?page=1) that proxies requests directly to the MCE REST Rowset API.
Page Size: 50 rows per page.
Access Cap: Users can click through up to 50 pages (2,500 rows total).
Timeout: If the SQL execution takes longer than 29 minutes, the worker fails the job and notifies the user.

**Q5:** I’m assuming we need explicit cancellation support (user hits “Stop”), which should stop polling/execution and trigger cleanup. Should cancellation be “best effort” (stop streaming + cleanup assets) or must we also attempt an MCE-side stop/abort if possible?
**Answer:** Cancellation is "Best Effort" (UI Stop + Worker Cleanup).
Details: Since MCE has no "Abort Query" API, the worker stops polling and streaming immediately. It then attempts to delete the QueryDefinition and the QPP_ Data Extension to free up resources.

**Q6:** For asset recycling, I’m assuming we need idempotent cleanup and also a safety-net sweeper for orphaned Temp DEs / QueryDefinitions (e.g., on worker startup or scheduled). Do you want that sweeper in-scope for this feature?
**Answer:** Yes, a Folder-Scoped Sweeper is in-scope.
Details: On each run we should check if a query from query plus plus exists, if it does, delete it and create a new query with a hash at the end witht he definitions for DEs we should just set a default 24 hour retension policy]

**Q7:** What’s explicitly out of scope for the first version (e.g., multi-statement SQL, very large result sets, historical run replays, run history UI, saving result exports, etc.)?
**Answer:**
  Multi-statement SQL: (Only one SELECT at a time).
  Large Result Sets: (> 2,500 rows).
  Historical Replays: (No re-running old jobs from the database).
  Result Exports: (No "Download as CSV" yet).
  Real-time Progress Bar: (Only show "Running..." status).

### Existing Code to Reference

**Similar Features Identified:**
- Feature: BullMQ scaffold - Path: `apps/worker/src/index.ts`
- Backend logic to reference: MCE Bridge service - Path: `packages/backend-shared/src/mce/mce-bridge.service.ts`
- Polling/SSE: No existing SSE or polling logic identified for reference.

### Follow-up Questions

**Follow-up 1:** For “Ready” notification: should the API/UI get status via SSE (events like `queued/running/ready/failed/canceled`), or is plain polling (`GET /runs/:runId/status`) sufficient?
**Answer:** Use SSE (Server-Sent Events) for the notification layer.
Reasoning: Since SQL execution is asynchronous and can take minutes, polling creates unnecessary overhead on the API. SSE allows the worker to push state changes (e.g., Queued → Running → Ready) via Redis Pub/Sub directly to the UI. This provides the "Zen Mode" real-time feel without the latency of client-side polling.

**Follow-up 2:** What exact MCE object(s) do we use for polling status after `SOAP Perform Start` (e.g., `QueryDefinition` status fields, an async “task” object, or something else you already have working)?
**Answer:** Use the `AsyncActivityStatus` SOAP object.
Flow: After calling Perform on the QueryDefinition, capture the `TaskID` from the response. The worker must then poll AsyncActivityStatus using a Retrieve call filtered by that TaskID.
Property: Check the Status property. You are looking for it to transition to Complete. If it says Error, capture the ErrorMsg property to display a human-readable error in the UI.

**Follow-up 3:** For the “QueryPlusPlus Results” folder: do you want this as an MCE `DataFolder` under a specific parent, and should we store and reuse its `CustomerKey/ID` in our DB per tenant+mid to avoid retrieving/creating every run?
**Answer:** Create a DataFolder where ContentType = 'dataextension'.
Location: Place it under the "Data Extensions" root (use ParentFolderID = the ID of the root DE folder).
Caching: Yes, store the `folderId` (or CustomerKey) in the tenants or settings table in our DB.
Benefit: Retrieving/creating the folder on every run is expensive. Checking our DB first and only creating it if it’s missing is much faster.

**Follow-up 4:** Sweeper behavior: you said “on each run check if a query from Query++ exists; if it does, delete it and create a new query with a hash at the end”. Should we: A) delete only assets matching the same `snippetName` prefix (e.g., `QPP_<SnippetName>_*`) before creating the new one, or B) never delete on-start (only delete assets tied to the current `runId`), and rely on the sweeper to clean orphaned/old assets?
**Answer:** Use Option B (Cleanup tied to runId) + a Sweeper.
Details: On start, do not delete old assets based on snippet name. This allows a user to have multiple "runs" of the same snippet open at once.
Instead:
  1. The worker creates assets with a unique hash: Q++_SnippetName_run123.
  2. The worker attempts a "Best Effort" cleanup of those specific assets once the job is finished or cancelled.
  3. The Sweeper handles anything that was "missed" (e.g., if the worker crashed).

**Follow-up 5:** Sweeper scope + schedule: should it run (a) at worker startup, (b) on a cron/interval (e.g., hourly), and (c) only inside the “QueryPlusPlus Results” folder? What’s the deletion rule for QueryDefinitions (since DE retention won’t remove them)?
**Answer:** Schedule: Run as a Cron/Interval job every 1 hour. Running at startup is risky in a containerized environment (multiple workers starting at once).
Scope: Only inside the Query++ Results folder.
Deletion Rule:
  Data Extensions: Salesforce's internal retention policy (24h) handles the data, but we should explicitly delete the DE object to keep the UI clean.
  QueryDefinitions: These never auto-delete. The sweeper must explicitly call SOAP Delete on any QueryDefinition in that folder where CreatedDate < (Now - 24h).

**Follow-up 6:** Can you point me to existing code we should reuse for BullMQ setup and any current SSE/polling endpoints (paths are enough)?
**Answer:**
BullMQ: There is a basic scaffold in apps/worker/src/index.ts. It’s currently a standalone script and needs to be migrated to a NestJS module to share our MceBridgeService.
MCE Service: Reuse packages/backend-shared/src/mce/mce-bridge.service.ts. It already has the base soapRequest and request methods you need.
Polling/SSE: There is no existing SSE or polling logic in the project yet. You will be establishing the pattern in apps/api (for SSE) and apps/worker (for the MCE-status polling).

## Visual Assets

### Files Provided:
No visual assets provided.

## Requirements Summary

### Functional Requirements
- Worker consumes BullMQ jobs and executes MCE SQL using the Temp DE + QueryDefinition “shell” pattern, using SOAP for asset creation/perform and REST rowset for result reads.
- Job payload includes `tenantId`, `userId`, `mid`, Connection context, `snippetName`, and enterpriseId (EID) as a best practice for enterprise-scope system views.
- Worker ensures a DataFolder named "QueryPlusPlus Results" exists and places all temporary assets there.
- Worker polls `AsyncActivityStatus` by `TaskID` until Status transitions to Complete or Error, capturing ErrorMsg for UI.
- API exposes SSE notifications to the UI; worker publishes state changes through Redis to support `queued → running → ready → failed → canceled`.
- API exposes a paginated results endpoint (e.g., `/results?page=1`) that proxies directly to the MCE REST Rowset API.
- Enforce 50 rows per page and allow up to 50 pages (2,500 rows total).
- Enforce a 29-minute execution timeout; if exceeded, worker fails the job and notifies the user.
- Provide best-effort cancellation: stop polling/streaming immediately and attempt cleanup of run-specific assets.

### Reusability Opportunities
- BullMQ scaffold to migrate into NestJS modules: `apps/worker/src/index.ts`
- MCE bridge service to reuse for SOAP/REST calls: `packages/backend-shared/src/mce/mce-bridge.service.ts`
- No similar SSE or polling logic identified for reference.

### Scope Boundaries
**In Scope:**
- NestJS worker refactor for shared modules (MCE bridge, database/RLS access, auth/token handling).
- BullMQ producer/consumer orchestration with tenant isolation context.
- RunToTempFlow orchestration through MCE SOAP/REST, including folder creation/caching, polling, timeout, cancellation, and cleanup.
- Folder-scoped hourly sweeper that deletes orphaned/expired QueryDefinitions and explicitly deletes DE objects to keep the MCE UI clean.

**Out of Scope:**
- Multi-statement SQL (only one SELECT at a time).
- Large result sets (> 2,500 rows).
- Historical replays (no re-running old jobs from the database).
- Result exports (no "Download as CSV" yet).
- Real-time progress bar (only show "Running..." status).

### Technical Considerations
- Use `AsyncActivityStatus` for polling; capture `TaskID` from Perform response and retrieve by that TaskID.
- Folder caching: store the folder identifier in the DB keyed by tenant+mid (tenants or settings table).
- Results are proxied; do not persist query results in the database.
- Asset naming conventions described as:
  - QPP_[SnippetName]_[Hash] / QPP_Results_[Hash] (hash = first 4 chars of runId)
  - Q++_SnippetName_run123 (as described for run-specific uniqueness)
