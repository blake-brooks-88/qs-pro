# Shell Query: Non-zero “Fast Path” via DE Row Probe

## Context / Continuation

This plan builds on:
- `docs/plans/2026-01-16-poll-job-split-design.md` (short-lived poll jobs; no long-running worker slot)
- `docs/plans/2026-01-16-completeddate-fix.md` (do **not** trust `CompletedDate` alone; use stronger gates + rowset queryability check)

Current state: we reliably mark runs `ready` once completion is detected and the target Data Extension rowset endpoint is queryable. However, for some runs, **rows are available earlier** than our completion signal, causing unnecessary “waiting” before results are shown.

## Problem

We want the earliest possible moment to show results **when the result set is non-empty**.

Today, we only fetch the rowset after a completion signal (`Status === "Complete"` or REST `isRunning === false` confirmations). In practice, the DE rowset can contain rows before those signals arrive.

## Core Product Assumption

We will assume:
- The target Data Extension is **not populated incrementally**; rows appear only once the query run has finished successfully.

Under this assumption:
- Seeing **any row** in the DE rowset is a strong “done + results available” signal.
- Seeing **0 rows** is not informative until completion is confirmed (0 rows could mean “still running” or “finished with 0 rows”).

## Goal

Add a **non-zero fast path**:
- During polling, periodically probe the target DE rowset with a *minimal request*.
- If the rowset contains **at least 1 row**, immediately mark the run `ready` and stop polling.
- If the rowset is empty, continue with normal completion detection and, once done, return `0 rows`.

## Non-goals

- Streaming / incremental results while the query is running.
- Changing the API response shape or UI pagination.
- Polling MCE directly from the browser (we want server-side bounded polling to avoid multiplying calls by `users × tabs`).

## Proposed State Machine Change (High-level)

In each `poll-shell-query` iteration:

1) **SOAP AsyncActivityStatus** (fail fast on `ErrorMsg` / `Status=Error`)
2) If `Status=Complete` → run the existing **rowset queryability** check → mark `ready`
3) Otherwise, attempt a **row probe**:
   - If rowset returns `count > 0` / `items.length > 0` → **mark `ready` immediately**
   - If rowset is empty → continue
4) Continue existing completion detection for the “0 rows” case:
   - REST `isRunning` confirmations (and/or stuck threshold logic)
   - When completion is confirmed → rowset queryability check → mark `ready` (even if 0 rows)

## Cost / Scalability Constraints

Row probing adds MCE REST calls. To keep this cost-safe:
- Probe with `?$page=1&$pageSize=1` (we only care if any row exists).
- Gate probing behind:
  - `ROW_PROBE_MIN_RUNTIME_MS` (avoid probing immediately at time 0)
  - `ROW_PROBE_MIN_INTERVAL_MS` (avoid probing on every poll iteration if polls are frequent early)
- Keep the existing poll budget + hard timeout as the primary guardrails.

Practical effect:
- Short queries that produce results quickly will mark `ready` earlier (fewer total poll iterations).
- Long queries won’t generate unbounded row probes due to min-interval + overall poll budget.

## Data to Collect (Debugging + Tuning)

Add DEBUG logs for row probe attempts with:
- `runId`, `elapsedMs`, `targetDeName`
- probe result: `count`, `items.length`, response status (or error status)
- whether the probe triggered the fast-path completion

Optional metrics (recommended if we already have worker metrics wired):
- Counter: `shell_query_row_probes_total`
- Counter: `shell_query_fast_path_ready_total`
- Histogram: `shell_query_time_to_first_row_ms` (time from `pollStartedAt` to first probe with `count>0`)

## Concrete Code Changes

### 1) Add poll job state + constants

File: `apps/worker/src/shell-query/shell-query.types.ts`

Add fields to `PollShellQueryJob`:
- `rowProbeAttempts?: number`
- `rowProbeLastCheckedAt?: string` (ISO timestamp)

Add constants to `POLL_CONFIG`:
- `ROW_PROBE_MIN_RUNTIME_MS` (suggest: `5000`)
- `ROW_PROBE_MIN_INTERVAL_MS` (suggest: `10000`–`15000`)
- `ROW_PROBE_PAGE_SIZE` (suggest: `1`)

### 2) Implement a “has any rows” probe

File: `apps/worker/src/shell-query/shell-query.processor.ts`

Add a helper method (naming flexible):

- `private async probeRowsetHasAnyRows(...): Promise<{ hasRows: boolean; count?: number; itemsLength?: number }>`
  - Call MCE rowset:
    - `GET /data/v1/customobjectdata/key/${deName}/rowset?$page=1&$pageSize=1`
  - Interpret as:
    - `hasRows = (response.count ?? 0) > 0 || (response.items?.length ?? 0) > 0`
  - Error handling:
    - `401` → terminal (credentials missing)
    - other errors → treat as “no signal” (log DEBUG, return `{hasRows:false}`)

### 3) Call the probe during non-terminal polling

File: `apps/worker/src/shell-query/shell-query.processor.ts`

In `handlePoll()` after SOAP error handling and before (or parallel to) REST `isRunning` checks:

1) Determine if we should probe:
   - `targetDeName` exists
   - `elapsedMs >= POLL_CONFIG.ROW_PROBE_MIN_RUNTIME_MS`
   - `Date.now() - Date.parse(rowProbeLastCheckedAt) >= POLL_CONFIG.ROW_PROBE_MIN_INTERVAL_MS`
2) If probing:
   - increment `rowProbeAttempts`
   - set `rowProbeLastCheckedAt = now`
   - if `hasRows === true`:
     - log `Run ${runId}: Row probe found rows (count=..., items=...), marking ready (fast-path)`
     - call `markReady(...)`
     - cleanup assets (same as other terminal transitions)
     - return terminal result
3) If `hasRows === false`: continue existing completion detection (SOAP/REST).

Important: keep this probe **server-side** (worker) so MCE calls remain bounded and independent of the number of browser clients.

### 4) Tests

File: `apps/worker/test/shell-query-processor.spec.ts`

Add unit tests for:
- “Queued + row probe returns count=1” → marks `ready` without waiting for `Status=Complete`.
- “Queued + row probe returns count=0” → does **not** mark ready; continues polling.
- Row probe `401` → fails terminal with a clear error message.
- Row probe min-interval respected (optional if we add `rowProbeLastCheckedAt` gating).

### 5) Fix REST `isRunning` identifier (required)

Row probing improves the **non-zero** case, but “0 rows” runs still rely heavily on completion detection. If REST `isRunning` is unreliable because we persist the wrong identifier, the “0 rows” path becomes slow and brittle.

- Treat QueryDefinition **ObjectID** as the REST identifier for:
  - `/automation/v1/queries/{id}/actions/isrunning/`
- Persist `NewObjectID` (SOAP Create) into `shell_query_runs.query_definition_id`
- Keep `queryCustomerKey` so we can SOAP-retrieve `QueryDefinition.ObjectID` by `CustomerKey` for older runs where `query_definition_id` is missing.

Files:
- `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts` (persist `NewObjectID` as `queryDefinitionId`)
- `apps/worker/src/shell-query/shell-query.processor.ts` (REST calls use stored value; simplify fallback logic)

## Acceptance Criteria

- For a query that returns rows, the run transitions to `ready` as soon as:
  - the next row-probe sees `count>0` (bounded by poll interval + probe min-interval), without waiting for SOAP `Status=Complete`.
- For a query that returns zero rows:
  - the run eventually transitions to `ready` via completion detection + rowset queryability check
  - UI shows “0 records found” only after completion is confirmed.
- Total MCE call volume remains bounded by:
  - poll job budgets/timeouts
  - `ROW_PROBE_MIN_INTERVAL_MS` gating
  - row probe uses `$pageSize=1`.

## Rollout / Safety

- Keep `ROW_PROBE_*` constants conservative initially (e.g. 5s min runtime, 10–15s min interval).
- If needed, add a kill-switch env var (e.g. `SHELL_QUERY_ROW_PROBE_ENABLED=false`) wired into `shouldProbe` so we can disable quickly without redeploying schema or UI.
