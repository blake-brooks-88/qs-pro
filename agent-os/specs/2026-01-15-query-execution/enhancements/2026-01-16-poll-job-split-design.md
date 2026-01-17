# Shell Query Polling Job Split Design

## Problem

The current `execute-shell-query` job holds a worker slot for up to 29 minutes while polling MCE's SOAP API in a loop. This:
- Ties up worker concurrency (50 slots max)
- Makes scaling expensive (need more workers for concurrent long queries)
- Risks orphaned polling if worker crashes mid-loop
- Uses `CompletedDate` as completion signal, which is unreliable (populated while status is still "Queued")

## Solution

Split into two job types with short-lived execution:

1. **`execute-shell-query`** - Creates assets, starts query, enqueues poll job, exits (~5-10s)
2. **`poll-shell-query`** - Single poll iteration, reschedules itself if not done (~1-2s per iteration)

Key change vs naive "re-enqueue" patterns:
- **Do not create a new poll job every iteration.**
- Keep **one** deterministic poll job (`jobId: poll-${runId}`) and use BullMQ's `job.moveToDelayed(...)` to schedule the next check.
  - This avoids queue bloat, avoids `jobId` collisions, and ensures only one poller exists per run.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    execute-shell-query                          │
│  1. Validate query                                              │
│  2. Create temp DE                                              │
│  3. Create QueryDefinition (capture ObjectID; NewID unreliable) │
│  4. Perform Start → get TaskID                                  │
│  5. Persist taskId, queryDefinitionId to DB                     │
│  6. Enqueue poll-shell-query with 2s delay                      │
│  7. Return (worker slot freed)                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     poll-shell-query                            │
│  1. Check if run canceled → exit                                │
│  2. Check poll budget exceeded → fail with timeout              │
│  3. SOAP: Retrieve AsyncActivityStatus by TaskID                │
│  4. Normalize: status = status?.trim().toLowerCase()            │
│  5. Decision tree:                                              │
│     ├─ status === "complete" → rowset readiness → mark ready    │
│     ├─ status === "error" OR ErrorMsg → mark failed, exit       │
│     ├─ row probe sees any rows → mark ready (fast-path)         │
│     ├─ completion gate:                                         │
│     │    └─ REST: GET /automation/v1/queries/{ObjectID}/isrunning│
│     │       ├─ isRunning === true → continue polling            │
│     │       └─ isRunning === false → confirm twice, then        │
│     │             rowset readiness → mark ready                 │
│     └─ else → moveToDelayed(backoff+jitter), exit               │
└─────────────────────────────────────────────────────────────────┘
```

### Reconciler (prevents orphaned runs)

Even with job splitting, runs can become "orphaned" if the worker crashes between persisting IDs and scheduling the poll job, or if Redis transiently rejects the enqueue.

Add a lightweight periodic reconciler (e.g. every 1-5 minutes) that:
- Finds runs in `queued|running` with `taskId` present, `completedAt` null, and older than a small grace window
- Ensures a `poll-${runId}` job exists (adds it if missing)

This keeps correctness without requiring the execute job to be perfect under failure.

## Database Changes

### New columns on `shell_query_runs`

```sql
-- NOTE: task_id already exists in current schema as varchar("task_id")
ALTER TABLE shell_query_runs ADD COLUMN query_definition_id varchar;
ALTER TABLE shell_query_runs ADD COLUMN poll_started_at timestamp;
```

### Drizzle schema update

```typescript
// packages/database/src/schema.ts (shellQueryRuns)
// Keep existing taskId: varchar("task_id")
// Add:
queryDefinitionId: varchar("query_definition_id"),
pollStartedAt: timestamp("poll_started_at"),
```

## Job Data Structures

### execute-shell-query (unchanged)

```typescript
interface ExecuteShellQueryJob {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  eid: string;
  sqlText: string;
  snippetName?: string;
}
```

### poll-shell-query (new)

```typescript
interface PollShellQueryJob {
  runId: string;
  tenantId: string;
  userId: string;
  mid: string;
  taskId: string;
  queryDefinitionId: string; // QueryDefinition ObjectID (GUID) for REST isRunning
  queryCustomerKey: string; // for SOAP fallback retrieval
  targetDeName: string; // DE key for rowset probes/readiness

  // Polling state
  pollCount: number; // purely for budget/metrics; not authoritative for timing
  pollStartedAt: string; // ISO timestamp (authoritative for MAX_DURATION_MS)

  // REST "not running" confirmations
  notRunningDetectedAt?: string;
  notRunningConfirmations?: number;

  // Rowset readiness verification (eventual consistency)
  rowsetReadyDetectedAt?: string;
  rowsetReadyAttempts?: number;

  // Row probe fast-path gating
  rowProbeAttempts?: number;
  rowProbeLastCheckedAt?: string;
}
```

## Constants

```typescript
const POLL_CONFIG = {
  INITIAL_DELAY_MS: 2000,
  MAX_DELAY_MS: 30000,
  BACKOFF_MULTIPLIER: 2,
  JITTER_RANGE: 0.4, // ±20% jitter

  // Secondary safety. MAX_DURATION_MS is the real cap.
  // Keep this conservative so a bug can't enqueue forever.
  MAX_POLL_COUNT: 120,
  MAX_DURATION_MS: 29 * 60 * 1000, // 29 minutes hard cap

  // Start REST isRunning checks earlier when SOAP reports CompletedDate
  COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS: 5000,

  STUCK_THRESHOLD_MS: 3 * 60 * 1000, // fallback when SOAP gives no usable signals

  NOT_RUNNING_CONFIRMATIONS: 2,
  NOT_RUNNING_CONFIRMATION_MIN_GAP_MS: 15000,

  ROWSET_READY_MAX_ATTEMPTS: 6,
  ROWSET_READY_INITIAL_DELAY_MS: 1500,
  ROWSET_READY_MAX_DELAY_MS: 8000,

  ROW_PROBE_MIN_RUNTIME_MS: 5000,
  ROW_PROBE_MIN_INTERVAL_MS: 15000,
  ROW_PROBE_PAGE_SIZE: 1,
};
```

## Processor Methods

### ShellQueryProcessor (modified)

```typescript
@Processor('shell-query', { concurrency: 50 })
export class ShellQueryProcessor extends WorkerHost {

  async process(
    job: Job<ExecuteShellQueryJob | PollShellQueryJob>,
    token?: string,
  ) {
    if (job.name === 'execute-shell-query') {
      return this.handleExecute(job as Job<ExecuteShellQueryJob>);
    }
    if (job.name === 'poll-shell-query') {
      return this.handlePoll(job as Job<PollShellQueryJob>, token);
    }
    throw new Error(`Unknown job name: ${job.name}`);
  }

  private async handleExecute(job: Job<ExecuteShellQueryJob>) {
    // 1. Run the flow (validate, create DE, create QueryDef, perform)
    // 2. Flow now returns { taskId, queryDefinitionId }
    // 3. Persist both IDs to DB
    // 4. Enqueue poll job
    // 5. Return immediately
  }

  private async handlePoll(job: Job<PollShellQueryJob>, token?: string) {
    if (!token) {
      throw new Error('Missing BullMQ token for poll job (required for moveToDelayed)');
    }
    // 1. Check cancellation
    // 2. Check budget/timeout
    // 3. Single SOAP poll
    // 4. Decision logic
    // 5. moveToDelayed or complete
  }
}
```

### RunToTempFlow (modified)

```typescript
interface FlowResult {
  status: 'ready' | 'failed' | 'canceled';
  taskId?: string;
  queryDefinitionId?: string; // NEW: for REST fallback
  errorMessage?: string;
}

// createQueryDefinition now returns both IDs
private async createQueryDefinition(...): Promise<{
  objectId: string;      // For SOAP Perform
  definitionId: string;  // For REST isRunning (QueryDefinition ObjectID)
}> {
  // ... existing SOAP create ...

  const result = response.Body?.CreateResponse?.Results;
  return {
    objectId: result.NewObjectID,
    definitionId: result.NewObjectID,
  };
}
```

### MCE ID Safety (REST isRunning uses QueryDefinition ObjectID)

Empirical behavior: SOAP `CreateResponse.Results.NewID` is frequently `"0"` for QueryDefinition creates, while `NewObjectID` is a stable GUID.

For REST `/automation/v1/queries/{id}/actions/isrunning/`, we should use the QueryDefinition **ObjectID** (GUID), not `NewID` and not `CustomerKey`.

Mitigation / fallback:
- Persist `NewObjectID` as `queryDefinitionId` on create.
- If `queryDefinitionId` is missing (older runs), SOAP Retrieve `QueryDefinition.ObjectID` by `CustomerKey` and persist it before calling REST.

## Backoff with Jitter

```typescript
function calculateNextDelay(pollCount: number): number {
  const baseDelay = Math.min(
    POLL_CONFIG.INITIAL_DELAY_MS * Math.pow(POLL_CONFIG.BACKOFF_MULTIPLIER, pollCount),
    POLL_CONFIG.MAX_DELAY_MS
  );

  // Add jitter: ±20%
  const jitter = 1 - (POLL_CONFIG.JITTER_RANGE / 2) + (Math.random() * POLL_CONFIG.JITTER_RANGE);
  return Math.floor(baseDelay * jitter);
}
```

## REST Fallback

```typescript
async function checkIsRunning(
  tenantId: string,
  userId: string,
  mid: string,
  queryDefinitionId: string,
): Promise<boolean> {
  const response = await this.mceBridge.request(
    tenantId,
    userId,
    mid,
    {
      method: 'GET',
      url: `/automation/v1/queries/${queryDefinitionId}/actions/isrunning/`,
    }
  );

  // MCE returns: { "isRunning": true } or { "isRunning": false }
  return response.isRunning === true;
}
```

## Job Enqueue Pattern

```typescript
// In handleExecute, after flow completes:
await this.shellQueryQueue.add(
  'poll-shell-query',
  {
    runId,
    tenantId,
    userId,
    mid,
    taskId: result.taskId,
    queryDefinitionId: result.queryDefinitionId,
    queryCustomerKey: result.queryCustomerKey,
    targetDeName: result.targetDeName,
    pollCount: 0,
    pollStartedAt: new Date().toISOString(),
    notRunningConfirmations: 0,
  },
  {
    delay: POLL_CONFIG.INITIAL_DELAY_MS,
    jobId: `poll-${runId}`, // Deterministic ID prevents duplicates
    removeOnComplete: { age: 3600 },
    removeOnFail: { age: 86400 },
  }
);

// In handlePoll, to schedule the next iteration without creating a new job:
import { DelayedError } from 'bullmq';

const delayMs = calculateNextDelay(job.data.pollCount);
await job.updateData({
  ...job.data,
  pollCount: job.data.pollCount + 1,
  // Track row probe / confirmations / readiness state as needed
});

await job.moveToDelayed(Date.now() + delayMs, token);
throw new DelayedError();
```

## Cancellation Handling

When a run is canceled:
1. The `cancelRun` API marks the run as `canceled` in DB
2. Next poll job checks DB status first, sees `canceled`, exits without re-enqueuing
3. No need to explicitly remove the poll job from queue (it self-terminates)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| SOAP poll fails (network) | Log warning, `moveToDelayed` with backoff (counts against budget) |
| SOAP returns Error status | Mark run as failed, don't re-enqueue |
| REST fallback fails | Log warning, continue SOAP polling |
| Poll budget exceeded | Mark run as failed with timeout message |
| Duration exceeded | Mark run as failed with timeout message |
| Worker crashes mid-poll | Job times out, BullMQ retries, poll resumes |

Note: with `moveToDelayed`, "re-enqueue" means "delay the same job", not creating a new job.

## Migration Path

1. Add new DB columns (backward compatible, nullable)
2. Deploy updated processor that handles both job types
3. Old `execute-shell-query` jobs in queue will still work (processor checks job.name)
4. New jobs use the split pattern

## Testing Considerations

- Test execute job completes quickly and enqueues poll
- Test poll job delays itself with correct backoff
- Test poll budget enforcement
- Test REST isRunning confirmation logic
- Test rowset readiness retries and terminal behavior
- Test non-zero row probe fast-path
- Test cancellation stops polling
- Test deterministic jobId prevents duplicate pollers

## Cleanup Placement

Cleanup can no longer live in the `execute-shell-query` `finally` block once polling is split:
- Deleting the QueryDefinition immediately after starting the query risks cancelling/breaking the running task.

Move cleanup to the terminal path:
- On `ready` / `failed` / `canceled` transitions in the poll job, perform cleanup (delete QueryDefinition, optional temp DE cleanup if desired)
- Keep the existing sweeper as a backstop for leaked assets

## Not-Running Confirmation Logic (when REST says not running)

Do not mark `ready` immediately on a single `isRunning === false`.

Recommended conservative rule:
- Require `NOT_RUNNING_CONFIRMATIONS` observations of `isRunning === false`
- Enforce `NOT_RUNNING_CONFIRMATION_MIN_GAP_MS` between confirmations
- Once confirmed, proceed to **rowset readiness checks** (bounded retries) before marking `ready`
- If SOAP ever returns `error`/`ErrorMsg`, fail immediately

This reduces the risk of false-ready due to transient REST responses and accounts for eventual consistency in the rowset endpoint.

## SSE Delivery Reliability

SSE is best-effort. If the worker crashes after updating DB but before publishing the SSE event, the client may miss the terminal event.

Mitigations (choose one):
1. SSE endpoint emits the latest DB status immediately on connect (cheap, reliable baseline)
2. Persist "last status event" in Redis/DB and replay on connect before streaming live pub/sub

Clients should also continue to rely on `GET /runs/:runId` as the source of truth on refresh/reconnect.

## Open Questions

### Proposed answers (pre-implementation)

1. Should we add a `poll_count` column to track polling attempts in DB for observability?
   - Optional. Prefer metrics first (cheaper, no extra DB writes). If we add it, update it sparingly (e.g. every 10 polls) or only on terminal transitions.

2. Should cleanup (delete QueryDefinition) happen in poll job on completion, or stay in finally block?
   - Cleanup should happen on terminal transitions in the poll job (or a dedicated cleanup job). It cannot remain in `execute-shell-query` `finally` without risking premature deletion while the query is still running.

3. Do we need metrics for poll iterations / stuck fallback triggers?
   - Yes. Add counters for poll iterations, REST isRunning checks, not-running confirmations, rowset readiness retries, row-probe attempts/fast-path completions, timeouts, and reconciler re-enqueues. These will drive safe tuning of thresholds/backoff without guesswork.
