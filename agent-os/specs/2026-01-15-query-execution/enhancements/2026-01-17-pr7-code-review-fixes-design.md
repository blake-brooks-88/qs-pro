# PR #7 Code Review Fixes Design

**Date:** 2026-01-17
**Status:** Approved
**Context:** Addresses critical issues identified in PR #7 code review

## Background

PR #7 adds an end-to-end query execution flow with:
- Real-time status via SSE (web hook + UI)
- Run status API endpoint
- Worker-side validation/expansion/inference
- Per-user RLS enforcement for shell query runs

A code review identified several issues that need to be addressed before merge.

## Issues & Fixes

### Critical Issue 1: Status Enum Mismatch

**Problem:**
- DB schema uses: `"queued" | "running" | "ready" | "failed" | "canceled"`
- Web `ExecutionStatus` and `QueryExecutionStatus` types don't include `"running"`
- `STATUS_MESSAGES` has no `"running"` key
- If API returns `"running"`, `getStatusMessage()` returns undefined and TypeScript errors occur on refresh reconnect

**Impact:** Broken refresh recovery + undefined UI messages

**Fix:**
Add `"running"` to web types and status messages:

1. `apps/web/src/features/editor-workspace/types.ts` - Add `"running"` to `ExecutionStatus`
2. `apps/web/src/features/editor-workspace/hooks/use-query-execution.ts` - Add `"running"` to `QueryExecutionStatus`
3. `apps/web/src/features/editor-workspace/components/ResultsPane.tsx`:
   - Add `"running": "Running..."` to `STATUS_MESSAGES`
   - Add `"running"` to `IN_PROGRESS_STATUSES` array

**Design Decision:**
Considered two approaches:
1. Add `"running"` to web types (simple, refresh shows "Running..." until SSE reconnects)
2. Persist granular stage in Redis, return in API (complex, better UX)

Chose option 1 per [SSE best practices](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - keep DB as source of truth for coarse state, let SSE provide granular progress.

---

### Critical Issue 2: SSE Endpoint Returns 400, Should Be 404

**Problem:**
- SSE endpoint (`streamEvents`) throws `BadRequestException` (HTTP 400) for "Run not found or unauthorized"
- GET status endpoint (`getRunStatus`) throws `NotFoundException` (HTTP 404) for "Run not found"
- Inconsistent responses leak information about resource existence

**Impact:** Information leakage + inconsistent API behavior

**Fix:**
Change `apps/api/src/shell-query/shell-query.controller.ts:124`:

```typescript
// Before
throw new BadRequestException('Run not found or unauthorized');

// After
throw new NotFoundException('Run not found');
```

**Security Rationale:**
For RLS "hide existence" pattern, both endpoints should return 404 to avoid leaking whether a run exists but the user lacks permission.

---

### Critical Issue 3: Logging May Leak User Data at Info Level

**Problem:**
- API logs snippetName and DE name at info level (`shell-query.service.ts:187`)
- Worker logs inferred schema (column names/types) at info level (`run-to-temp.strategy.ts:91`)
- Production logs may expose user-provided data and schema details

**Impact:** Potential data leakage in production logs

**Fix:**
Downgrade to debug level:

1. `apps/api/src/shell-query/shell-query.service.ts:187`:
```typescript
// Before
this.logger.log(`Fetching results for run ${runId}: DE="${deName}", snippetName="${run.snippetName}", url="${url}"`);

// After
this.logger.debug(`Fetching results for run ${runId}: DE="${deName}", snippetName="${run.snippetName}", url="${url}"`);
```

2. `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts:91`:
```typescript
// Before
this.logger.log(`Inferred schema: ${JSON.stringify(...)}`);

// After
this.logger.debug(`Inferred schema: ${JSON.stringify(...)}`);
```

---

### Nice-to-Have: tableMetadata Size Limits

**Problem:**
The `tableMetadata` Zod schema validates shape but not size, allowing potential DoS via large payloads with thousands of tables/fields.

**Fix:**
Add size constraints to `apps/api/src/shell-query/shell-query.controller.ts`:

```typescript
tableMetadata: z
  .record(
    z.string().max(128),  // Table name max length
    z.array(
      z.object({
        Name: z.string().max(128),
        FieldType: z.string().max(32),
        MaxLength: z.number().optional(),
      }),
    ).max(500),  // Max 500 fields per table
  )
  .refine(
    (data) => !data || Object.keys(data).length <= 50,
    { message: 'Maximum 50 tables allowed' }
  )
  .optional(),
```

**Limits Chosen:**
- 50 tables max (reasonable for a single query)
- 500 fields per table (MCE DEs typically have far fewer)
- 128 chars for names, 32 for field types

---

## Deferred Items

The following suggestions were identified but deferred:

1. **SSE reconnect UX:** Current SSE stream is pub/sub only (no replay). Refresh may show stale "queued" until the next event. Could persist latest granular stage in Redis and send immediately on subscribe. *Deferred: Added "running" to web types as simpler solution.*

2. **Worker RLS nested-context edge:** `runWithUserContext` sets `app.user_id` using a new reserved connection when a db-context already exists, which won't affect the context DB connection. *Deferred: Not currently hit, future footgun to address when needed.*

---

## Files Changed Summary

| File | Change |
|------|--------|
| `apps/web/src/features/editor-workspace/types.ts` | Add `"running"` to `ExecutionStatus` |
| `apps/web/src/features/editor-workspace/hooks/use-query-execution.ts` | Add `"running"` to `QueryExecutionStatus` |
| `apps/web/src/features/editor-workspace/components/ResultsPane.tsx` | Add `"running"` to `STATUS_MESSAGES` and `IN_PROGRESS_STATUSES` |
| `apps/api/src/shell-query/shell-query.controller.ts` | Change BadRequestException to NotFoundException; add tableMetadata size limits |
| `apps/api/src/shell-query/shell-query.service.ts` | Downgrade log from info to debug |
| `apps/worker/src/shell-query/strategies/run-to-temp.strategy.ts` | Downgrade log from info to debug |

---

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [Bull Queue Progress Tracking](https://app.studyraid.com/en/read/12483/403597/queue-progress-tracking)
- [Job Queue Patterns: DB vs Redis](https://neon.com/guides/nodejs-queue-system)
