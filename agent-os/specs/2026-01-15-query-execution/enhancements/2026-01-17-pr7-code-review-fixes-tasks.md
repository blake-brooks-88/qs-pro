# PR #7 Code Review Fixes - Tasks

**Design:** [2026-01-17-pr7-code-review-fixes-design.md](./2026-01-17-pr7-code-review-fixes-design.md)

## Tasks

### 1. Fix Status Enum Mismatch (Critical)
- [x] Add `"running"` to `ExecutionStatus` type in `apps/web/src/features/editor-workspace/types.ts`
- [x] Add `"running"` to `QueryExecutionStatus` type in `apps/web/src/features/editor-workspace/hooks/use-query-execution.ts`
- [x] Add `"running": "Running..."` to `STATUS_MESSAGES` in `apps/web/src/features/editor-workspace/components/ResultsPane.tsx`
- [x] Add `"running"` to `IN_PROGRESS_STATUSES` array in `ResultsPane.tsx`

### 2. Fix SSE 404 Consistency (Critical)
- [x] Change `BadRequestException` to `NotFoundException` in `apps/api/src/shell-query/shell-query.controller.ts:124`
- [x] Update error message from "Run not found or unauthorized" to "Run not found"

### 3. Downgrade Log Levels (Critical)
- [x] Change `this.logger.log` to `this.logger.debug` in `apps/api/src/shell-query/shell-query.service.ts:187`
- [x] Change `this.logger.log` to `this.logger.debug` in `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts:91`

### 4. Add tableMetadata Size Limits (Nice-to-have)
- [x] Add `.max(128)` to table name string in Zod schema
- [x] Add `.max(128)` to field Name string in Zod schema
- [x] Add `.max(32)` to FieldType string in Zod schema
- [x] Add `.max(500)` to fields array in Zod schema
- [x] Add `.refine()` to limit to 50 tables max

### 5. SSE Reconnect Backfill
- [ ] Persist latest SSE event per run (e.g. `run-status:last:${runId}`) when publishing (`apps/worker/src/shell-query/shell-query.processor.ts`)
- [ ] On SSE subscribe, emit the latest persisted event immediately (before streaming live events) (`apps/api/src/shell-query/shell-query-sse.service.ts`)
- [ ] Ensure persisted event TTL matches run lifecycle (e.g. 1–24h) and is cleared/overwritten appropriately on terminal states
- [ ] Add/extend tests to cover: refresh during execution receives a current status without waiting for next event

### 6. RLS Nested Context Safety
- [x] Align `packages/backend-shared/src/database/db-context.ts` with API to carry a request/job-scoped reserved SQL client (so `set_config` uses the same connection as Drizzle queries)
- [x] Update `packages/backend-shared/src/database/rls-context.service.ts` to reuse the context reserved client when present (avoid opening a separate reserved connection that won't affect the active context DB)
- [x] Update any affected call sites / middleware wiring and add a focused test proving `app.user_id` applies inside nested `runWithUserContext`

### 7. Log Redaction
- [x] Avoid logging user-controlled identifiers (e.g. `snippetName`, `deName`) at info/debug; log only stable IDs/hashes where possible (`apps/api/src/shell-query/shell-query.service.ts`)
- [x] Avoid logging inferred schema details (column names/types) by default; if needed for troubleshooting, guard behind debug + redaction (`apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts`)
- [ ] Add a quick regression check to ensure logs don't contain raw SQL/snippet names in typical flows

### 8. Verification
- [ ] Run `pnpm typecheck` to verify no TypeScript errors
- [ ] Run `pnpm test` to verify all tests pass
- [ ] Run `pnpm lint` to verify no lint errors
