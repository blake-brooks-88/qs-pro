# Poll Job Split Implementation Tasks

Reference: `docs/plans/2026-01-16-poll-job-split-design.md`

## Phase 1: Database Schema

- [x] Add `query_definition_id` column to `shell_query_runs` in Drizzle schema (`packages/database/src/schema.ts`)
- [x] Add `poll_started_at` column to `shell_query_runs`
- [x] Generate migration: `pnpm db:generate`
- [x] Run migration: `pnpm db:migrate`

## Phase 2: Types and Constants

- [x] Add `PollShellQueryJob` interface to `shell-query.types.ts`
- [x] Add `POLL_CONFIG` constants to `shell-query.types.ts`
- [x] Update `FlowResult` to include `queryDefinitionId`
- [x] Add `calculateNextDelay()` utility function

## Phase 3: RunToTempFlow Changes

- [x] Modify `createQueryDefinition()` to return `{ objectId, definitionId }`
- [x] Update `execute()` to capture and return `queryDefinitionId` in `FlowResult`
- [x] Remove cleanup from `execute-shell-query` flow (will move to poll job terminal path)

## Phase 4: Processor Refactor

- [x] Refactor `process()` to dispatch based on `job.name`
- [x] Extract current execute logic into `handleExecute()`
- [x] Remove `pollStatus()` loop from `handleExecute()`
- [x] Add poll job enqueue at end of `handleExecute()`
- [x] Persist `taskId` and `queryDefinitionId` to DB before enqueueing poll

## Phase 5: Poll Job Implementation

- [x] Implement `handlePoll()` method
- [x] Add cancellation check (DB status lookup)
- [x] Add budget/timeout checks
- [x] Implement single SOAP poll with case-insensitive status normalization
- [x] Implement decision tree:
  - `status === "complete"` → mark ready, cleanup, return
  - `status === "error"` or ErrorMsg → mark failed, return
  - Stuck threshold check → REST fallback
  - Grace period logic
  - Default: `moveToDelayed` with backoff+jitter
- [x] Use `DelayedError` pattern for rescheduling

## Phase 6: REST Fallback

- [x] Add `checkIsRunning()` method using mceBridge.request
- [x] Use QueryDefinition ObjectID as REST `isRunning` identifier (persist `NewObjectID` as `queryDefinitionId`; SOAP fallback retrieves `ObjectID` by `CustomerKey` if missing)
- [x] Implement not-running confirmations on `isRunning === false`

## Phase 7: Cleanup in Terminal Path

- [x] Move QueryDefinition cleanup to poll job terminal transitions
- [x] Call cleanup on ready/failed/canceled
- [x] Keep sweeper as backstop (no changes needed)

## Phase 8: Reconciler (optional, can be follow-up)

- [ ] Create `ShellQueryReconciler` scheduled task (every 2-5 minutes)
- [ ] Find runs with `status IN (queued, executing_query)`, `taskId` present, `completedAt` null, older than grace window
- [ ] Check if `poll:${runId}` job exists in queue
- [ ] Enqueue missing poll jobs

## Phase 9: Tests

- [x] Update `shell-query-processor.spec.ts`:
  - Test execute job completes quickly and enqueues poll
  - Test poll job delays itself with correct backoff
  - Test poll budget enforcement
  - Test stuck threshold triggers REST fallback
  - Test not-running confirmation logic
  - Test cancellation stops polling
- [x] Update `shell-query-cancellation.spec.ts` for new job split
- [x] Add integration test for full flow (web hook + results fetching)

## Phase 10: Metrics (optional, can be follow-up)

- [ ] Add counter for poll iterations
- [ ] Add counter for REST fallback attempts
- [ ] Add counter for not-running confirmations / fast-path completions
- [ ] Add counter for timeouts

## Verification

- [x] Run `pnpm typecheck` - no errors
- [x] Run `pnpm --filter worker test` - tests pass
- [ ] Manual test: execute query, verify poll job created, verify completion
- [ ] Manual test: cancel mid-poll, verify polling stops
- [ ] Manual test: CompletedDate triggers early REST `isRunning` checks (after min runtime)
