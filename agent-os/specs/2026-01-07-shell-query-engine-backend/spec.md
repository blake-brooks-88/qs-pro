# Specification: Shell Query Engine (Backend)

## Goal
Implement a NestJS-based worker that executes SQL queries against Salesforce Marketing Cloud using the Temp DE + QueryDefinition "shell" pattern, with BullMQ orchestration, SSE status notifications, and zero-data proxy streaming.

## User Stories
- As a developer, I want to execute ad-hoc SQL queries so that I can quickly analyze Marketing Cloud data without manually creating Query Activities
- As a user, I want real-time status updates (queued, running, ready, failed) so that I know when my query results are available

## Specific Requirements

**NestJS Worker Refactor**
- Refactor `apps/worker` from a standalone BullMQ script into a NestJS application
- Share `MceModule`, `DatabaseModule`, and `AuthModule` with the API by extracting them into importable modules
- Use the existing `MceBridgeService` for SOAP/REST calls with token injection
- Maintain RLS isolation using `RlsContextService.runWithTenantContext()`

**BullMQ Job Orchestration**
- API acts as Producer, Worker acts as Consumer on a `shell-query` queue
- Job payload must include: `tenantId`, `userId`, `mid`, `connectionId`, `snippetName`, `enterpriseId`, `sqlText`, `runId`
- Use Redis connection configuration from environment variables
- Implement job timeout of 29 minutes; fail the job if exceeded

**Worker Configuration**
- Concurrency: 50 (optimized for I/O-heavy MCE API calls)
- Lock duration: 120000ms (2 minutes) to prevent stalled job false positives
- Stalled interval: 15000ms (15 seconds)
- Max stalled count: 3 (before moving to failed)
- Graceful shutdown: Implement `onModuleDestroy` to close workers properly
- Connection pooling: Reuse Redis connections via ioredis pools

**Job Cleanup Settings**
- Configure `removeOnComplete: { age: 3600 }` to auto-delete completed jobs after 1 hour
- Configure `removeOnFail: { age: 86400 }` to retain failed jobs for 24 hours (debugging window)
- Prevents Redis memory bloat from accumulated job metadata

**Job Retry Strategy**
- Attempts: 2 (for transient MCE API failures)
- Backoff: Exponential with 5000ms base delay
- Retry on: Network timeouts, 5xx responses, rate limit (429) responses
- Do NOT retry on: Token refresh failures (permanent), MCE validation errors (user-fixable)

**RunToTempFlow Strategy**
- Implement `IFlowStrategy` interface with `RunToTempFlow` as first implementation
- Flow sequence: Ensure folder exists -> Create Temp DE (24h retention) -> Create QueryDefinition -> Perform Start -> Poll status -> Notify ready
- Asset naming: `QPP_[SnippetName]_[Hash]` for named snippets, `QPP_Results_[Hash]` for untitled (hash = first 4 chars of runId)
- Capture `TaskID` from Perform response for polling

**QueryPlusPlus Results Folder**
- Create a `DataFolder` with `ContentType = 'dataextension'` under the root DE folder if it doesn't exist
- Cache the folder ID in the database (tenant+mid scoped) to avoid re-creation on every run
- Add a `qppFolderId` column to an appropriate settings table

**Async Status Polling**
- Poll `AsyncActivityStatus` SOAP object using the `TaskID` from Perform response
- Check `Status` property for `Complete` or `Error`
- On `Error`, capture `ErrorMsg` property for user-friendly display

**Polling Interval Configuration**
- Initial delay: 2 seconds
- Max delay: 30 seconds (capped)
- Backoff multiplier: 2x
- Sequence: 2s → 4s → 8s → 16s → 30s → 30s → ...
- Max attempts: Calculated to fit within 29-minute job timeout
- Reference: [SFMC SOAP API Best Practices](https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/soap_api_best_practices.html)

**SSE Status Notifications**
- Worker publishes state changes (`queued`, `running`, `ready`, `failed`, `canceled`) to Redis Pub/Sub channel keyed by `runId`
- API subscribes to Redis channel and streams events via SSE endpoint (`GET /runs/:runId/events`)
- Include `errorMessage` in `failed` events

**SSE Endpoint Security**
- SSE endpoint MUST validate session/JWT before establishing connection
- Verify `runId` belongs to authenticated user's tenant+mid context
- Reject connection if user lacks access to the run

**Paginated Results Endpoint**
- API exposes `GET /runs/:runId/results?page=1` that proxies to MCE REST Rowset API
- Page size: 50 rows per page
- Maximum pages: 50 (2,500 rows total cap)
- Do NOT persist results in database (zero-data proxy)

**Results Endpoint Security**
- `GET /runs/:runId/results` MUST validate:
  1. User session is authenticated
  2. `runId` belongs to user's tenant+mid context
  3. Job status is `ready` (reject with 409 if still running, 404 if failed/not found)
- Proxy MCE REST rowset response directly; do not parse or store

**Rate Limiting**
- Implement rate limiting on job creation: max 10 concurrent runs per user
- Throttle SSE connections per user: max 5 simultaneous streams
- Return 429 Too Many Requests when limits exceeded

**SQL Execution Trust Boundary**
- SQL text is passed directly to MCE QueryDefinition; MCE handles execution and validation
- No server-side SQL parsing or validation (MCE is the trust boundary)
- Log SQL text hash (not content) for debugging; avoid logging raw SQL to prevent sensitive data exposure

**Best-Effort Cancellation**
- Support user-initiated cancellation via `POST /runs/:runId/cancel`
- Worker stops polling immediately and publishes `canceled` status
- Attempt cleanup of run-specific assets (Temp DE and QueryDefinition)

**Asset Cleanup and Recycling**
- On job completion or cancellation, worker attempts to delete the Temp DE and QueryDefinition
- Assets are identified by unique hash tied to `runId`, not snippet name
- Log cleanup failures but don't fail the job

**Folder-Scoped Sweeper**
- Run as a cron job every 1 hour (not at startup to avoid container race conditions)
- Scope: only assets inside "QueryPlusPlus Results" folder
- Delete QueryDefinitions where `CreatedDate < (Now - 24h)` via SOAP Delete
- Explicitly delete DE objects (even though data expires via retention) to keep MCE UI clean

**Observability Requirements**
- Log all job state transitions with structured context: `{ tenantId, runId, status, durationMs }`
- Include tenant context in all error logs for debugging multi-tenant issues
- Emit metrics for monitoring:
  - `shell_query_jobs_total` (counter, labels: status)
  - `shell_query_duration_seconds` (histogram)
  - `shell_query_failures_total` (counter, labels: error_type)
  - `shell_query_active_jobs` (gauge)
- Integrate Bull Board for job queue inspection (admin-only access, authenticated)
- Health check endpoint: Worker exposes `/health` for container orchestration

## Existing Code to Leverage

**MceBridgeService (`apps/api/src/mce/mce-bridge.service.ts`)**
- Provides `soapRequest()` for SOAP Create/Retrieve/Perform/Delete operations
- Provides `request()` for REST API calls (rowset retrieval)
- Handles token injection via `AuthService.refreshToken()` and error normalization

**BullMQ Scaffold (`apps/worker/src/index.ts`)**
- Basic Queue and Worker setup with Redis connection
- Migrate to NestJS module pattern using `@nestjs/bullmq`
- Replace standalone script with processor-based architecture

**RlsContextService (`apps/api/src/database/rls-context.service.ts`)**
- Use `runWithTenantContext(tenantId, mid, fn)` for database operations within worker jobs
- Sets PostgreSQL session variables for RLS policy enforcement

**MceModule (`apps/api/src/mce/mce.module.ts`)**
- Exports `MceBridgeService` and `MetadataService`
- Import AuthModule and CacheModule dependencies
- Can be shared directly with worker app

**Database Schema (`packages/database/src/schema.ts`)**
- Existing `queryHistory` table can track run metadata (status, timing, errors)
- Add migration for folder cache column if needed

## Out of Scope
- Multi-statement SQL execution (only single SELECT supported)
- Large result sets exceeding 2,500 rows
- Historical run replays from stored query history
- Result exports (CSV download functionality)
- Real-time progress bar (only status indicators: Running, Ready, etc.)
- `RunToTargetFlow` implementation (writes to existing DEs)
- Schema management or target DE creation
- Query validation or SQL parsing
- Frontend UI components
- Authentication flow changes
