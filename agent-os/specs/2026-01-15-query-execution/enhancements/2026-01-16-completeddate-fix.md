# Fix: Completion Detection Without Relying on CompletedDate

## Problem

We need a reliable, cost-safe way to detect when an MCE QueryDefinition execution has actually finished so we can:
- Mark the run `ready` only when it is truly complete
- Avoid “0 rows” caused by fetching results before the target Data Extension (DE) is queryable (eventual consistency)
- Avoid holding a worker slot for up to 29 minutes

## Evidence

From production logs (run `7014073c-1358-4c4e-b4e2-1e4073a1e035`):

```
10:54:37 AM - Query started with TaskID: 10684
10:54:39 AM - Poll #1: Status="Queued", CompletedDate="1/16/2026 10:54:35 AM"
10:54:43 AM - Poll #2: Status="Queued", CompletedDate="1/16/2026 10:54:35 AM"
10:54:59 AM - Poll #3: Status="Queued", CompletedDate="1/16/2026 10:54:35 AM"
```

Observations:
1. `Status` remains `"Queued"` across polls (does not show `"Complete"` in these samples)
2. `CompletedDate` is populated from the first poll and even appears **earlier than query start**
3. Target DE becomes queryable only after some delay (eventual consistency)

## Why a “CompletedDate + fixed grace period” fix is risky

Using `CompletedDate` as the completion signal (even with a fixed grace window) is not safe given the evidence:
- `CompletedDate` can be populated immediately (first poll) and can be earlier than the query “start” log line
- A fixed delay (8s) could mark a long-running query as `ready` while it is still running

Conclusion: `CompletedDate` should be treated as a **hint** at most (diagnostic), not as a completion gate.

## Recommended Solution (sound completion gate + eventual-consistency handling)

### Completion gate: “not running anymore”

Mark a run `ready` only when we have a strong “done” signal:
- Fail fast when SOAP shows an error (`Status === "Error"` or non-empty `ErrorMsg`)
- Prefer a “not running anymore” check:
  - REST: `GET /automation/v1/queries/{queryDefinitionId}/actions/isrunning/` returns `{ isRunning: boolean }`
  - When `isRunning === false`, treat the query as finished (with a small confirmation to avoid transient false negatives)

### Eventual consistency: “rowset is queryable”

After the query is finished (not running), the DE may still not be queryable. Before marking `ready`, verify the rowset endpoint is queryable:
- API proxy: `GET /data/v1/customobjectdata/key/{deName}/rowset?$page=1&$pageSize=50`
- Treat “rowset fetch succeeds (200)” as “queryable”; do not require `Count > 0` because zero rows can be a valid query result.
- Use bounded retries with backoff+jitter (small total budget).

This replaces a fixed “8 second grace period” with a bounded, observable readiness check.

## Implementation Plan

### 1) Persist the REST queryDefinitionId safely

Use the QueryDefinition **ObjectID** (GUID) as the REST id for `isrunning`:
1. Persist SOAP `CreateResponse.Results.NewObjectID` as `queryDefinitionId`
2. If `queryDefinitionId` is missing (older runs), SOAP-retrieve `QueryDefinition.ObjectID` by `CustomerKey` and persist it before calling REST

### 2) Poll job state fields

Use explicit “verification state” fields (rather than a single ambiguous completion timestamp):

```typescript
interface PollShellQueryJob {
  // ... existing fields ...

  // REST "not running" confirmation
  notRunningDetectedAt?: string; // ISO timestamp when isRunning first observed false
  notRunningConfirmations?: number; // number of observed false checks

  // Rowset readiness verification (eventual consistency)
  rowsetReadyDetectedAt?: string; // ISO timestamp when rowset first succeeded
}
```

### 3) Poll decision logic (single iteration)

The poll iteration should follow this order:

```typescript
// 1) Cancellation check (DB) → exit

// 2) SOAP poll AsyncActivityStatus (by TaskID)
//    - If Status === "Error" OR ErrorMsg non-empty → mark failed
//    - If Status === "Complete" (if it ever happens) → proceed to rowset readiness check

// 3) Completion gate (REST "isRunning")
//    - Trigger when either:
//        a) SOAP includes CompletedDate AND elapsed >= COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS, OR
//        b) elapsed > STUCK_THRESHOLD_MS (fallback when SOAP gives no usable signals)
//    - If isRunning === true → continue polling
//    - If isRunning === false:
//         increment notRunningConfirmations
//         require 2 confirmations separated by >= 15s
//         then proceed to rowset readiness check

// 4) Rowset readiness check (MCE REST rowset)
//    - Attempt fetching page 1
//    - If 200 OK: mark ready
//    - If 404/409/5xx or transient errors: retry with bounded backoff
//      (counts against poll budget)
```

### 4) Replace fixed grace period constants

Remove any fixed grace delay and replace with bounded confirmation / readiness constants:

```typescript
const POLL_CONFIG = {
  // Existing backoff/duration budgets...

  COMPLETED_DATE_TRIGGER_MIN_RUNTIME_MS: 5000,

  NOT_RUNNING_CONFIRMATIONS: 2,
  NOT_RUNNING_CONFIRMATION_MIN_GAP_MS: 15000, // 15s

  ROWSET_READY_MAX_ATTEMPTS: 6, // bounded, small
  ROWSET_READY_INITIAL_DELAY_MS: 1500,
  ROWSET_READY_MAX_DELAY_MS: 8000,
};
```

## Why This Approach

| Approach | Pros | Cons |
|----------|------|------|
| Wait for `Status="Complete"` only | Canonical | Not observed reliably in current evidence |
| Use `CompletedDate` + fixed grace | Simple | Can mark `ready` while still running; timestamp anomalies |
| **“Not running” gate + rowset readiness** | Correct completion semantics + handles eventual consistency | Slightly more logic; requires REST id fallback |

This minimizes false-ready and avoids “0 rows because too early” without introducing an arbitrary fixed delay.

## Risks and Mitigations

**Risk**: Additional API calls (REST isRunning + rowset readiness).  
**Mitigation**: Both are bounded by backoff+jitter and budgets; using a rescheduled poll job avoids holding concurrency slots.

**Risk**: REST id might be missing in DB for older runs.  
**Mitigation**: SOAP-retrieve `QueryDefinition.ObjectID` by `CustomerKey` and persist it, then retry the REST `isrunning` check.

**Risk**: Rowset readiness retries could delay “ready” even when query is complete.  
**Mitigation**: Keep readiness attempts small and capped; if rowset never becomes queryable within the budget, fail with a clear error (so we can observe and tune).

## Test Plan

1. Unit test: SOAP ErrorMsg causes immediate failure
2. Unit test: REST `isRunning=true` continues polling
3. Unit test: REST `isRunning=false` requires confirmation before proceeding
4. Unit test: Rowset readiness succeeds → marks ready
5. Unit test: Rowset readiness repeatedly fails → fails with clear “rowset not queryable” message
6. Integration test: full flow returns results without premature “0 rows”

## Files to Modify

1. `apps/worker/src/shell-query/shell-query.types.ts` - Add poll-state fields for not-running confirmations + rowset readiness constants
2. `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts` - Capture candidate REST id from SOAP create; ensure fallback retrieval is possible
3. `apps/worker/src/shell-query/shell-query.processor.ts` - Update poll logic to use REST isRunning gating + rowset readiness verification
4. `apps/worker/src/shell-query/shell-query.sweeper.ts` - (Optional) ensure it cleans up leaked QueryDefinitions/DEs
5. `apps/worker/test/*` - Add tests for the new polling logic
