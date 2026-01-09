# Worker Service

The Worker service handles background job processing using BullMQ for the QS Pro application.

## Features

- Shell Query execution via BullMQ queues
- Health checks and metrics endpoints
- Bull Board UI for queue monitoring and management
- Redis-based job queue management
- Hourly asset cleanup sweeper

## Environment Variables

```bash
# Required
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://qs_runtime:change_me_dev_only@127.0.0.1:5432/qs_pro

# Admin access for Bull Board UI
ADMIN_API_KEY=your-secure-admin-key-here
```

## Bull Board Admin UI

The Bull Board UI is available at `/admin/queues` and provides a web interface for monitoring and managing BullMQ queues.

### Authentication

Bull Board is protected with API key authentication. To access the UI:

1. Set the `ADMIN_API_KEY` environment variable to a secure random string
2. Include the API key in your requests using the `x-admin-key` header

**Example:**
```bash
# Using curl
curl -H "x-admin-key: your-admin-key" http://localhost:3001/admin/queues

# Using httpie
http http://localhost:3001/admin/queues x-admin-key:your-admin-key
```

**Security Notes:**
- If `ADMIN_API_KEY` is not set, all requests to `/admin/*` routes will be denied
- Always use a strong, randomly generated key in production
- Never commit the actual API key to version control
- Consider using a secrets manager in production environments

## Development

```bash
# Start the worker service
pnpm --filter worker start

# Run tests
pnpm --filter worker test

# Type checking
pnpm --filter worker typecheck
```

---

## Shell Query Architecture

The Shell Query system enables users to execute SQL queries against Marketing Cloud Engagement (MCE) Data Extensions asynchronously. This is necessary because MCE query execution can take up to 30 minutes for large datasets.

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER BROWSER                                    │
└─────────────────────────────────────────────────────────────────────────────┘
         │                              ▲
         │ POST /api/runs               │ SSE /api/runs/:id/events
         │ { sqlText }                  │ { status: "ready" }
         ▼                              │
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API SERVICE                                     │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │ ShellQueryController│───▶│  ShellQueryService  │                         │
│  └─────────────────────┘    └──────────┬──────────┘                         │
│                                        │                                     │
│                         1. Create run record in DB                          │
│                         2. Add job to BullMQ queue                          │
│                         3. Return runId immediately                         │
└─────────────────────────────────────────────────────────────────────────────┘
         │                              ▲
         │ BullMQ Job                   │ Redis Pub/Sub
         ▼                              │ (run-status:{runId})
┌─────────────────────────────────────────────────────────────────────────────┐
│                             WORKER SERVICE                                   │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │ ShellQueryProcessor │───▶│   RunToTempFlow     │                         │
│  └─────────────────────┘    └──────────┬──────────┘                         │
│                                        │                                     │
│                         1. Create temp DE in MCE                            │
│                         2. Create QueryDefinition                           │
│                         3. Start query execution                            │
│                         4. Poll for completion                              │
│                         5. Publish status via Redis                         │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ SOAP/REST API
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MARKETING CLOUD ENGAGEMENT (MCE)                          │
│                                                                              │
│  QueryDefinition ──▶ Executes SQL ──▶ Writes to Temp DE                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Layer (`apps/api/src/shell-query/`)

The API layer handles client requests and job queuing.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/runs` | Create a new query run |
| `GET` | `/api/runs/:runId/events` | SSE stream for status updates |
| `GET` | `/api/runs/:runId/results?page=1` | Fetch paginated results |
| `POST` | `/api/runs/:runId/cancel` | Cancel a running query |

### ShellQueryService

**`createRun(context, sqlText, snippetName?)`**

1. Generates a unique `runId` (UUID)
2. Checks rate limit (max 10 concurrent runs per user)
3. Creates a `shell_query_runs` record with status `queued`
4. Adds job to BullMQ `shell-query` queue
5. Returns `runId` immediately (async execution)

**`getResults(runId, tenantId, userId, mid, page)`**

1. Verifies run exists and belongs to tenant
2. Checks run status is `ready`
3. Proxies to MCE REST API: `GET /data/v1/customobjectdata/key/{deName}/rowset`
4. Returns paginated results (50 rows per page, max 50 pages)

**`cancelRun(runId, tenantId)`**

1. Updates run status to `canceled`
2. Worker checks this flag during polling and stops

### SSE Events

The `/api/runs/:runId/events` endpoint streams real-time status updates:

```typescript
// Events published by worker
{ status: "running" }           // Query started
{ status: "ready" }             // Query completed successfully
{ status: "failed", errorMessage: "..." }  // Query failed
{ status: "canceled" }          // Query was canceled
```

---

## Worker Layer (`apps/worker/src/shell-query/`)

The worker processes queued jobs and orchestrates MCE interactions.

### ShellQueryProcessor

BullMQ processor with:
- **Concurrency:** 50 simultaneous jobs
- **Lock duration:** 120 seconds
- **Retries:** 2 attempts with exponential backoff

**Job Processing Flow:**

```
1. Receive job from queue
2. Update DB status → "running"
3. Publish Redis event → { status: "running" }
4. Execute RunToTempFlow strategy
5. Poll MCE for completion (up to 29 minutes)
6. On success: Update DB → "ready", publish event
7. On failure: Update DB → "failed", publish event
8. Cleanup: Delete QueryDefinition from MCE
```

**Error Handling:**

- **Terminal errors** (400, 401, 403): No retry, mark as `UnrecoverableError`
- **Transient errors**: Retry with exponential backoff
- **Timeout**: Fail after 29 minutes of polling

### Strategies

The worker uses a strategy pattern for different execution flows. Currently implemented:

#### RunToTempFlow (`strategies/run-to-temp.strategy.ts`)

Executes a SELECT query and stores results in a temporary Data Extension.

**Steps:**

1. **Ensure QPP Folder**
   - Search for "QueryPlusPlus Results" folder in MCE
   - Create if not exists
   - Cache folder ID in `tenant_settings` table

2. **Create Temp DE**
   - Name format: `QPP_{SnippetName}_{hash}` or `QPP_Results_{hash}`
   - Placed in QPP folder
   - Schema: Placeholder with `_QPP_ID` and `Data` fields
   - Note: Dynamic schema detection is a future enhancement

3. **Create QueryDefinition**
   - Name format: `QPP_Query_{runId}`
   - Contains the user's SQL
   - Target: The temp DE created above
   - Update type: Overwrite

4. **Perform Query**
   - SOAP `Perform` action with `Start`
   - Returns MCE `TaskID` for status polling

5. **Return TaskID**
   - Processor handles polling via `AsyncActivityStatus`

### Asset Cleanup

#### Immediate Cleanup (per job)

After each job completes/fails, the processor deletes the `QueryDefinition`:
- DE is NOT deleted immediately (user needs to fetch results)

#### Sweeper (`shell-query.sweeper.ts`)

Hourly cron job that cleans up old assets:

```
1. For each tenant/MID with credentials:
2. Find "QueryPlusPlus Results" folder
3. Retrieve QueryDefinitions older than 24 hours
4. Delete QueryDefinition + associated DE
```

---

## Data Model

### shell_query_runs Table

```sql
CREATE TABLE shell_query_runs (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  mid TEXT NOT NULL,
  snippet_name TEXT,
  sql_text_hash TEXT NOT NULL,  -- SHA-256 hash (not storing raw SQL)
  status TEXT NOT NULL,          -- queued, running, ready, failed, canceled
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Status Transitions

```
queued ──▶ running ──▶ ready
                  └──▶ failed
       └──▶ canceled (can happen from queued or running)
```

---

## MCE Assets Created

| Asset Type | Naming Convention | Lifecycle |
|------------|-------------------|-----------|
| Data Folder | `QueryPlusPlus Results` | Permanent (one per BU) |
| Data Extension | `QPP_{name}_{hash}` | 24h (deleted by sweeper) |
| QueryDefinition | `QPP_Query_{runId}` | Deleted on job completion |

---

## Rate Limits

| Limit | Value | Scope |
|-------|-------|-------|
| Concurrent runs | 10 | Per user |
| SSE connections | 5 | Per user |
| Results pages | 50 | Per request |
| Polling timeout | 29 min | Per job |

---

## Metrics

Prometheus metrics exposed at `/metrics`:

| Metric | Type | Description |
|--------|------|-------------|
| `shell_query_jobs_total` | Counter | Total jobs by status (ready/failed) |
| `shell_query_duration_seconds` | Histogram | Job duration |
| `shell_query_failures_total` | Counter | Failures by error type |
| `shell_query_active_jobs` | Gauge | Currently processing jobs |

---

## Future Enhancements

1. **Dynamic DE Schema**: Parse SELECT columns to create matching DE schema
2. **Save to Target DE**: Alternative flow that writes to user-specified DE
3. **Query Caching**: Reuse results for identical queries within TTL
4. **Priority Queues**: Different priorities for Pro vs Enterprise users
