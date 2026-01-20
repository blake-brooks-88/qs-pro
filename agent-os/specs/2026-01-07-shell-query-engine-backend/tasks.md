# Task Breakdown: Shell Query Engine (Backend)

## Overview
Total Tasks: 7 Task Groups (40+ subtasks)

This feature implements a NestJS-based worker that executes SQL queries against Salesforce Marketing Cloud using the Temp DE + QueryDefinition "shell" pattern, with BullMQ orchestration, SSE status notifications, and zero-data proxy streaming.

## Task List

### Infrastructure Layer

#### Task Group 1: Database Schema & Migrations
**Dependencies:** None

**Drizzle Workflow:** Schema changes follow the `schema.ts` → `pnpm db:generate` → `pnpm db:migrate` flow. DO NOT MANUALLY EDIT OR CREATE MIGRATIONS. IF you're feeling stuck HALT and await further instructions.

- [x] 1.0 Complete database schema updates
  - [x] 1.1 Write 3-5 focused tests for schema changes
    - Test `shellQueryRuns` table insertion with required fields
    - Test `qppFolderId` column on tenant settings
    - Test status enum values (`queued`, `running`, `ready`, `failed`, `canceled`)
  - [x] 1.2 Define `shellQueryRuns` table in Drizzle schema
    - Edit `packages/database/src/schema.ts`
    - Fields: `id` (uuid), `tenantId`, `userId`, `mid`, `snippetName`, `sqlTextHash` (not raw SQL), `status`, `taskId` (MCE), `errorMessage`, `createdAt`, `startedAt`, `completedAt`
    - Foreign keys: `tenantId` -> `tenants.id`, `userId` -> `users.id`
    - Reference pattern from: `queryHistory` table
    - Add Zod validation schemas (`selectShellQueryRunSchema`, `insertShellQueryRunSchema`)
  - [x] 1.3 Add `qppFolderId` column to `credentials` table (or new `tenantSettings` table)
    - Store folder ID per tenant+mid scope
    - Nullable (created on first run)
    - Edit `packages/database/src/schema.ts`
  - [x] 1.4 Generate migration files
    - Run `pnpm db:generate` to auto-generate migration SQL from schema diff
    - Review generated migration in `packages/database/drizzle/` folder
    - Verify indexes on: `tenantId`, `status`, `createdAt` are included
  - [x] 1.5 Apply migrations to database
    - Run `pnpm db:migrate` to apply changes to PostgreSQL
    - Verify tables created successfully
  - [x] 1.6 Ensure database layer tests pass
    - Run ONLY the 3-5 tests written in 1.1
    - Verify schema changes work correctly

**Acceptance Criteria:**
- The 3-5 tests written in 1.1 pass
- `pnpm db:generate` creates clean migration files
- `pnpm db:migrate` applies without errors
- Schema supports RLS via `tenantId` column
- `qppFolderId` caching column exists

---

#### Task Group 2: NestJS Worker Refactor
**Dependencies:** Task Group 1

- [x] 2.0 Complete NestJS worker application setup
  - [x] 2.1 Write 4-6 focused tests for worker infrastructure
    - Test worker module bootstraps successfully
    - Test Redis connection via health check
    - Test graceful shutdown behavior
    - Test job processor registration
  - [x] 2.2 Refactor `apps/worker` from standalone script to NestJS application
    - Create `apps/worker/src/main.ts` with NestFactory bootstrap
    - Create `apps/worker/src/app.module.ts` as root module
    - Configure Fastify adapter (consistent with API)
  - [x] 2.3 Extract shared modules for cross-app import
    - Move/export `MceModule` to be importable from worker
    - Move/export `DatabaseModule` with RLS context service
    - Move/export `AuthModule` for token refresh
    - Consider `packages/shared-nest` or direct cross-app imports
  - [x] 2.4 Configure `@nestjs/bullmq` module
    - Register `BullModule.forRoot()` with Redis connection from env
    - Register `shell-query` queue
    - Configure worker settings: concurrency=50, lockDuration=120000ms, stalledInterval=15000ms, maxStalledCount=3
  - [x] 2.5 Implement graceful shutdown
    - Add `onModuleDestroy` lifecycle hook
    - Close BullMQ workers properly
    - Close Redis connections
  - [x] 2.6 Add health check endpoint
    - Expose `/health` for container orchestration
    - Check Redis connectivity
    - Check BullMQ queue status
  - [x] 2.7 Ensure worker infrastructure tests pass
    - Run ONLY the 4-6 tests written in 2.1
    - Verify worker starts and connects to Redis

**Acceptance Criteria:**
- The 4-6 tests written in 2.1 pass
- Worker boots as NestJS application
- Shared modules importable without duplication
- Health endpoint responds correctly
- Graceful shutdown works

---

### BullMQ Job Layer

#### Task Group 3: Job Producer & Queue Configuration
**Dependencies:** Task Group 2

- [x] 3.0 Complete API-side job producer
  - [x] 3.1 Write 4-6 focused tests for job producer
    - Test job creation with valid payload
    - Test job payload includes all required context (tenantId, userId, mid, connectionId, snippetName, enterpriseId, sqlText, runId)
    - Test rate limiting (max 10 concurrent runs per user)
    - Test 429 response when limit exceeded
  - [x] 3.2 Create `ShellQueryModule` in API
    - Inject BullMQ queue for `shell-query`
    - Provide service layer for job creation
  - [x] 3.3 Implement `ShellQueryService` as producer
    - Method: `createRun(context, sqlText, snippetName)` -> returns `runId`
    - Generate unique `runId` (uuid)
    - Add job to queue with full payload
    - Configure job options: `removeOnComplete: { age: 3600 }`, `removeOnFail: { age: 86400 }`
  - [x] 3.4 Implement rate limiting
    - Track active runs per user (Redis or DB query)
    - Max 10 concurrent runs per user
    - Return 429 if limit exceeded
  - [x] 3.5 Create `POST /runs` endpoint
    - Accept: `{ sqlText, snippetName? }`
    - Validate user session/JWT
    - Return: `{ runId, status: 'queued' }`
  - [x] 3.6 Ensure job producer tests pass
    - Run ONLY the 4-6 tests written in 3.1

**Acceptance Criteria:**
- The 4-6 tests written in 3.1 pass
- Jobs enqueued with full tenant context
- Rate limiting enforced
- `POST /runs` endpoint functional

---

#### Task Group 4: Job Consumer & RunToTempFlow Strategy
**Dependencies:** Task Group 3

- [x] 4.0 Complete worker-side job processor
  - [x] 4.1 Write 6-8 focused tests for job processor
    - Test job receives and parses payload correctly
    - Test RLS context set before database operations
    - Test folder creation/retrieval (mock MCE)
    - Test Temp DE creation (mock MCE)
    - Test QueryDefinition creation and perform (mock MCE)
    - Test status polling loop (mock MCE)
    - Test 29-minute timeout handling
    - Test cleanup on completion
  - [x] 4.2 Create `IFlowStrategy` interface
    - Method: `execute(job: ShellQueryJob): Promise<FlowResult>`
    - Return: `{ status, taskId?, errorMessage? }`
  - [x] 4.3 Implement `RunToTempFlow` strategy
    - Step 1: Ensure folder exists (create DataFolder if missing, cache ID)
    - Step 2: Create Temp DE with 24h retention (naming: `QPP_[SnippetName]_[Hash]` or `QPP_Results_[Hash]` if snippetName was not provided)
    - Step 3: Create QueryDefinition with SQL text
    - Step 4: Perform Start on QueryDefinition
    - Step 5: Capture `TaskID` from response
  - [x] 4.4 Create `ShellQueryProcessor` as BullMQ processor
    - Decorate with `@Processor('shell-query')`
    - Inject `RlsContextService`, `MceBridgeService`, flow strategies
    - Wrap execution in `runWithTenantContext()`
    - Log job state transitions with structured context
  - [x] 4.5 Implement async status polling
    - Poll `AsyncActivityStatus` SOAP object by `TaskID`
    - Check `Status` property for `Complete` or `Error`
    - Backoff: 2s -> 4s -> 8s -> 16s -> 30s (capped)
    - Max attempts calculated for 29-minute timeout
    - Capture `ErrorMsg` on error
  - [x] 4.6 Implement job timeout
    - Configure 29-minute job timeout
    - Fail job if exceeded
    - Publish `failed` status with timeout error
  - [x] 4.7 Implement retry strategy
    - Attempts: 2 for transient failures
    - Backoff: Exponential with 5000ms base
    - Retry on: Network timeouts, 5xx, 429
    - NO retry on: Token failures, MCE validation errors
  - [x] 4.8 Implement asset cleanup
    - On completion/failure: attempt delete of Temp DE and QueryDefinition
    - Log cleanup failures but don't fail job
    - Assets identified by `runId` hash
  - [x] 4.9 Ensure job processor tests pass
    - Run ONLY the 6-8 tests written in 4.1

**Acceptance Criteria:**
- The 6-8 tests written in 4.1 pass
- Full RunToTempFlow sequence works
- Polling respects backoff schedule
- Timeout and retry behavior correct
- Cleanup attempted on completion

---

### API Notification Layer

#### Task Group 5: SSE Status Notifications & Results Endpoint
**Dependencies:** Task Group 4

- [x] 5.0 Complete SSE and results API
  - [x] 5.1 Write 5-7 focused tests for SSE and results
    - Test SSE endpoint requires authentication
    - Test SSE receives status updates from Redis pub/sub
    - Test SSE rejects unauthorized `runId` access
    - Test results endpoint returns paginated data
    - Test results endpoint returns 409 if job still running
    - Test results endpoint returns 404 if job failed/not found
    - Test SSE connection rate limiting (max 5 per user)
  - [x] 5.2 Implement Redis Pub/Sub publisher in worker
    - Publish status changes to channel keyed by `runId`
    - Events: `queued`, `running`, `ready`, `failed`, `canceled`
    - Include `errorMessage` in `failed` events
  - [x] 5.3 Create SSE endpoint `GET /runs/:runId/events`
    - Validate session/JWT before establishing connection
    - Verify `runId` belongs to user's tenant+mid
    - Subscribe to Redis channel for `runId`
    - Stream events to client
  - [x] 5.4 Implement SSE rate limiting
    - Max 5 simultaneous SSE connections per user
    - Return 429 when exceeded
  - [x] 5.5 Create paginated results endpoint `GET /runs/:runId/results`
    - Query param: `page` (default 1)
    - Validate: user authenticated, `runId` belongs to user, job status is `ready`
    - Return 409 if still running, 404 if failed/not found
    - Proxy to MCE REST Rowset API (zero-data, no storage)
    - Page size: 50 rows, max 50 pages (2,500 rows cap)
  - [x] 5.6 Ensure SSE and results tests pass
    - Run ONLY the 5-7 tests written in 5.1

**Acceptance Criteria:**
- The 5-7 tests written in 5.1 pass
- SSE streams status updates in real-time
- SSE properly secured
- Results endpoint proxies MCE data
- Rate limiting enforced

---

#### Task Group 6: Cancellation & Sweeper
**Dependencies:** Task Group 5

- [x] 6.0 Complete cancellation and sweeper functionality
  - [x] 6.1 Write 4-6 focused tests for cancellation and sweeper
    - Test cancellation stops polling immediately
    - Test cancellation publishes `canceled` status
    - Test cancellation attempts asset cleanup
    - Test sweeper runs on schedule (not startup)
    - Test sweeper only deletes assets > 24h old in QPP folder
  - [x] 6.2 Create `POST /runs/:runId/cancel` endpoint
    - Validate user owns the run
    - Signal worker to stop (via Redis or job update)
    - Return acknowledgment
  - [x] 6.3 Implement cancellation handling in worker
    - Listen for cancel signal
    - Stop polling immediately
    - Publish `canceled` status
    - Attempt best-effort cleanup of Temp DE and QueryDefinition
  - [x] 6.4 Implement folder-scoped sweeper
    - Run as cron job every 1 hour (NOT at startup)
    - Scope: only "QueryPlusPlus Results" folder
    - Delete QueryDefinitions where `CreatedDate < (Now - 24h)` via SOAP Delete
    - Explicitly delete DE objects to keep MCE UI clean
  - [x] 6.5 Register sweeper in worker module
    - Use `@nestjs/schedule` for cron
    - Configure cron expression for hourly runs
  - [x] 6.6 Ensure cancellation and sweeper tests pass
    - Run ONLY the 4-6 tests written in 6.1

**Acceptance Criteria:**
- The 4-6 tests written in 6.1 pass
- Cancellation works end-to-end
- Sweeper cleans orphaned assets
- Sweeper respects 24h age threshold

---

### Observability Layer

#### Task Group 7: Logging, Metrics & Admin Tools
**Dependencies:** Task Group 6

**Logging & Metrics Strategy:**
- **Logs destination:** stdout via NestJS Logger (12-factor app standard; deployment handles aggregation to CloudWatch/Datadog/etc.)
- **Log format:** JSON in production (`LOG_FORMAT=json` env var), plain text in development
- **Metrics destination:** Expose `GET /metrics` endpoint in Prometheus format for scraping
- **No new dependencies:** Use NestJS Logger (already present) + `prom-client` for metrics

- [x] 7.0 Complete observability infrastructure
  - [x] 7.1 Write 3-5 focused tests for observability
    - Test structured logging includes tenant context
    - Test job state transitions are logged to stdout in JSON format
    - Test `/metrics` endpoint returns Prometheus format
    - Test Bull Board accessible with admin auth only
  - [x] 7.2 Implement structured JSON logging
    - Create custom NestJS LoggerService that outputs JSON when `LOG_FORMAT=json`
    - Log all job state transitions with context: `{ tenantId, runId, status, durationMs, timestamp }`
    - Log SQL text hash (NOT raw SQL) for debugging
    - Include tenant context in all error logs
    - Output to stdout (container orchestrator captures logs)
  - [x] 7.3 Implement Prometheus metrics endpoint
    - Install `prom-client` package
    - Create `MetricsModule` with `/metrics` endpoint
    - Register metrics:
      - `shell_query_jobs_total` (counter, labels: status)
      - `shell_query_duration_seconds` (histogram)
      - `shell_query_failures_total` (counter, labels: error_type)
      - `shell_query_active_jobs` (gauge)
    - Increment/observe metrics in job processor
  - [x] 7.4 Integrate Bull Board for queue inspection
    - Mount at admin-only route (e.g., `/admin/queues`)
    - Require admin authentication
    - Display job status, retries, failures
  - [x] 7.5 Ensure observability tests pass
    - Run ONLY the 3-5 tests written in 7.1

**Acceptance Criteria:**
- The 3-5 tests written in 7.1 pass
- Logs output to stdout in JSON format (production) or plain text (development)
- `/metrics` endpoint returns valid Prometheus format
- Bull Board accessible for admins

---

### Testing

#### Task Group 8: Test Review & Gap Analysis
**Dependencies:** Task Groups 1-7

- [ ] 8.0 Review existing tests and fill critical gaps only
  - [ ] 8.1 Review tests from Task Groups 1-7
    - Review the 3-5 tests written by Task Group 1 (Database)
    - Review the 4-6 tests written by Task Group 2 (Worker Infra)
    - Review the 4-6 tests written by Task Group 3 (Producer)
    - Review the 6-8 tests written by Task Group 4 (Consumer)
    - Review the 5-7 tests written by Task Group 5 (SSE/Results)
    - Review the 4-6 tests written by Task Group 6 (Cancel/Sweeper)
    - Review the 3-5 tests written by Task Group 7 (Observability)
    - Total existing tests: approximately 29-43 tests
  - [ ] 8.2 Analyze test coverage gaps for THIS feature only
    - Identify critical end-to-end workflows lacking coverage
    - Focus on integration between API producer and worker consumer
    - Check Redis pub/sub integration points
    - Verify RLS context propagation tests
  - [ ] 8.3 Write up to 10 additional strategic tests maximum
    - E2E: Job submitted via API, processed by worker, SSE notifies ready
    - E2E: Job fails, SSE notifies with error message
    - E2E: User cancels job mid-execution
    - Integration: MCE folder creation + caching
    - Integration: Results proxy with real MCE mock
  - [ ] 8.4 Run feature-specific tests only
    - Run tests from Task Groups 1-7 plus gap-filling tests
    - Expected total: approximately 39-53 tests maximum
    - Verify all critical workflows pass
    - Do NOT run entire application test suite

**Acceptance Criteria:**
- All feature-specific tests pass (approximately 39-53 tests total)
- Critical end-to-end workflows covered
- No more than 10 additional tests added
- Testing focused exclusively on Shell Query Engine feature

---

## Execution Order

Recommended implementation sequence:

1. **Task Group 1: Database Schema & Migrations**
   - Foundation for tracking runs and caching folder IDs

2. **Task Group 2: NestJS Worker Refactor**
   - Infrastructure for running jobs with shared modules

3. **Task Group 3: Job Producer & Queue Configuration**
   - API-side job creation and queueing

4. **Task Group 4: Job Consumer & RunToTempFlow Strategy**
   - Core execution logic in worker

5. **Task Group 5: SSE Status Notifications & Results Endpoint**
   - Real-time feedback and data retrieval

6. **Task Group 6: Cancellation & Sweeper**
   - User control and cleanup automation

7. **Task Group 7: Logging, Metrics & Admin Tools**
   - Production readiness observability

8. **Task Group 8: Test Review & Gap Analysis**
   - Final quality assurance

---

## Technical Notes

### Existing Code to Leverage
- `packages/backend-shared/src/mce/mce-bridge.service.ts` - SOAP/REST bridge with token injection
- `apps/worker/src/index.ts` - Basic BullMQ scaffold (refactor to NestJS)
- `apps/api/src/database/rls-context.service.ts` - RLS tenant context
- `packages/database/src/schema.ts` - Drizzle schema patterns

### Key Configuration Values
- Worker concurrency: 50
- Lock duration: 120,000ms
- Job timeout: 29 minutes
- Polling backoff: 2s -> 4s -> 8s -> 16s -> 30s (capped)
- Page size: 50 rows
- Max pages: 50 (2,500 rows)
- Rate limit: 10 concurrent runs per user
- SSE limit: 5 connections per user
- Job cleanup: completed after 1h, failed after 24h

### Observability Configuration
- **Logs:** stdout (NestJS Logger) → deployment captures (CloudWatch, Datadog, etc.)
- **Log format:** `LOG_FORMAT=json` for production, plain text for development
- **Metrics:** `GET /metrics` endpoint in Prometheus format
- **Dependencies:** `prom-client` (new), NestJS Logger (existing)

### Asset Naming Convention
- Named snippet: `QPP_[SnippetName]_[Hash]` (hash = first 4 chars of runId)
- Untitled snippet: `QPP_Results_[Hash]`

### Out of Scope (Per Spec)
- Multi-statement SQL
- Large result sets (> 2,500 rows)
- Historical run replays
- Result exports (CSV)
- Real-time progress bar
- `RunToTargetFlow` implementation
- Frontend UI components
