# apps/worker

NestJS + BullMQ job processor. Two-phase query execution model against MCE.

## Commands

```bash
pnpm worker:dev                    # Watch mode on :3001
pnpm --filter worker test          # Unit tests
pnpm --filter worker test:integration  # Integration tests (requires Postgres + Redis)
```

## Architecture

**Queues:**
- `shell-query` — Main queue with two job types:
  - `execute-shell-query` — Decrypts SQL, runs strategy, enqueues poll job
  - `poll-shell-query` — Polls MCE async status until completion (max 29min, 120 polls)
- `siem-webhook` — Audit webhook delivery (concurrency: 5)

**Execution Strategies:**
- `RunToTempFlow` — Creates temp DE, queries into it
- `RunToTargetFlow` — Queries into user-specified target DE

**Polling Logic:**
- Initial delay: 30s, then reschedules via `job.moveToDelayed()` + `DelayedError`
- Multiple completion signals: row probe, completed date detection, stuck threshold (3min)
- Not-running confirmation requires 2 checks ≥15s apart before marking ready

## Key Patterns

**Error Handling:**
- `UnrecoverableError` from BullMQ — fails permanently, no retries
- `isTerminal(error)` check converts known-fatal errors to UnrecoverableError
- Default retry: 3 attempts with exponential backoff (2s base)
- Decryption failures are always unrecoverable

**Security:**
- SQL text + table metadata stripped from completed/failed job payloads
- Error messages truncated to 4000 chars via `truncateClientSafeMessage()`
- Error messages encrypted before DB insert

**Concurrency:** Configurable via `WORKER_CONCURRENCY` env var (default: 50)

## Gotchas

- **Noop Redis in tests:** `RedisModule` returns a stub when `NODE_ENV === "test"` — no SSE events published.
- **RLS context required:** All DB/MCE calls must run inside `rlsContext.runWithUserContext()` or `runWithTenantContext()`.
- **BullBoard UI:** Available at `/admin/queues` (admin auth required).
- **Sweeper cron:** Hourly cleanup of temp QueryDefinitions older than 24h across all tenants.
- **Shared global-setup:** Integration tests share `../api/test/global-setup.ts` with the API.
- **Lock duration:** 120s — long-running poll jobs must stay within this window per cycle.

## Test Conventions

| Type | Location | Pattern |
|------|----------|---------|
| Unit | `src/**/__tests__/` | `*.test.ts` |
| Integration | `test/` | `*.integration.test.ts` |
